use near_sdk::{
    assert_one_yocto,
    collections::{LookupMap, LookupSet},
    env,
    json_types::U128,
    near, require,
    serde_json::{self, json},
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

const UNIT: u128 = 1_000_000;
const STORAGE: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR covers discovery record and token
const ROSTER: [&str; 7] = [
    "nyan-cat",
    "pikachu",
    "gengar",
    "pepe",
    "veemon",
    "piyomon",
    "chill-guy",
];
const SHOP: [&str; 8] = [
    "nyan-cat",
    "pikachu",
    "gengar",
    "pepe",
    "veemon",
    "piyomon",
    "chill-guy",
    "doge",
];

#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct Card {
    pub token_id: String,
    pub card_id: String,
    pub barcode: String,
    pub owner_id: AccountId,
}
#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct Listing {
    pub id: String,
    pub seller: AccountId,
    pub token_id: String,
    pub price: U128,
}
#[near(serializers=[borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct Fighter {
    pub instance_id: String,
    pub hp: u32,
    pub max_hp: u32,
    pub skill: Skill,
}
#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct Skill {
    pub id: String,
    pub name: String,
}
#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct Reward {
    pub status: String,
    pub text: String,
}
#[near(serializers=[borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct Effect {
    pub id: String,
    pub source: String,
    pub hit: bool,
}
#[near(serializers=[borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct Raid {
    pub id: String,
    pub round: u32,
    pub phase: String,
    pub boss_hp: u32,
    pub boss_max_hp: u32,
    pub heavy_attack_warning: Option<String>,
    pub status: String,
    pub team: Vec<Fighter>,
    pub reward: Option<Reward>,
    pub effect: Option<Effect>,
}
#[near(serializers=[json])]
pub struct RaidAction {
    pub instance_id: String,
    pub skill_id: String,
}
#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct Payment {
    pub receiver: AccountId,
    pub treasury: AccountId,
    pub amount: U128,
    pub kind: String,
    pub claim_key: String,
    pub token_id: Option<String>,
    pub shards: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Game {
    owner: AccountId,
    usdc: AccountId,
    tomo: AccountId,
    koban: AccountId,
    sponsor: AccountId,
    cards: LookupMap<String, Card>,
    owned: LookupMap<AccountId, Vec<String>>,
    discoveries: LookupMap<String, String>,
    counts: LookupMap<AccountId, u32>,
    shards: LookupMap<AccountId, u128>,
    credits: LookupMap<AccountId, u128>,
    claims: LookupSet<String>,
    raids: LookupMap<AccountId, Raid>,
    locks: LookupSet<String>,
    listings: LookupMap<String, Listing>,
    listing_ids: Vec<String>,
    counter: u64,
    distributed: u128,
    reserved: LookupMap<AccountId, u32>,
    pending_payments: LookupSet<AccountId>,
    inflight: LookupSet<String>,
}
fn event(name: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"scanmon", "version":"1.0.0", "event":name, "data":[data]})
    ));
}
fn mt_event(name: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"nep245", "version":"1.0.0", "event":name, "data":[data]})
    ));
}
fn check_barcode(raw: &str) -> String {
    require!(
        [8, 12, 13].contains(&raw.len()) && raw.bytes().all(|x| x.is_ascii_digit()),
        "Invalid EAN/UPC"
    );
    let digits: Vec<u32> = raw.bytes().map(|x| (x - b'0') as u32).collect();
    let sum: u32 = digits[..digits.len() - 1]
        .iter()
        .rev()
        .enumerate()
        .map(|(i, d)| d * if i % 2 == 0 { 3 } else { 1 })
        .sum();
    require!(
        (sum + digits[digits.len() - 1]) % 10 == 0,
        "Invalid checksum"
    );
    if raw.len() == 12 {
        format!("0{raw}")
    } else {
        raw.into()
    }
}
fn species(barcode: &str) -> String {
    let hash = barcode.bytes().fold(0u32, |n, d| {
        n.wrapping_mul(31).wrapping_add((d - b'0') as u32)
    });
    ROSTER[hash as usize % ROSTER.len()].into()
}

#[near]
impl Game {
    #[init]
    pub fn new(
        owner_id: AccountId,
        usdc_contract_id: AccountId,
        tomo_account_id: AccountId,
        koban_account_id: AccountId,
        sponsor_account_id: AccountId,
    ) -> Self {
        Self {
            owner: owner_id,
            usdc: usdc_contract_id,
            tomo: tomo_account_id,
            koban: koban_account_id,
            sponsor: sponsor_account_id,
            cards: LookupMap::new(b"c"),
            owned: LookupMap::new(b"o"),
            discoveries: LookupMap::new(b"d"),
            counts: LookupMap::new(b"n"),
            shards: LookupMap::new(b"s"),
            credits: LookupMap::new(b"u"),
            claims: LookupSet::new(b"q"),
            raids: LookupMap::new(b"r"),
            locks: LookupSet::new(b"k"),
            listings: LookupMap::new(b"l"),
            listing_ids: vec![],
            counter: 0,
            distributed: 0,
            reserved: LookupMap::new(b"v"),
            pending_payments: LookupSet::new(b"p"),
            inflight: LookupSet::new(b"i"),
        }
    }
    #[payable]
    pub fn sponsor_player(
        &mut self,
        identity_hash: String,
        account_id: AccountId,
    ) -> PromiseOrValue<bool> {
        require!(
            env::predecessor_account_id() == self.sponsor,
            "Sponsor only"
        );
        require!(
            identity_hash.len() == 64 && identity_hash.bytes().all(|x| x.is_ascii_hexdigit()),
            "Invalid identity"
        );
        require!(account_id.as_str().len() == 64, "Implicit account required");
        let identity = format!("sponsor-id:{identity_hash}");
        let key = format!("sponsor-account:{account_id}");
        if self.claims.contains(&identity) || self.claims.contains(&key) {
            Promise::new(self.sponsor.clone())
                .transfer(env::attached_deposit())
                .detach();
            return PromiseOrValue::Value(false);
        }
        require!(
            env::attached_deposit() >= NearToken::from_millinear(520),
            "Attach 0.52 NEAR"
        );
        self.claims.insert(&identity);
        self.claims.insert(&key);
        PromiseOrValue::Promise(Promise::new(account_id).transfer(NearToken::from_millinear(500)))
    }
    pub fn get_config(&self) -> serde_json::Value {
        json!({"owner_id":self.owner,"usdc_contract_id":self.usdc,"tomo_account_id":self.tomo,"koban_account_id":self.koban,"season":"v1","tomo_budget":U128(self.credit(&self.tomo)),"koban_budget":U128(self.credit(&self.koban)),"distributed":U128(self.distributed)})
    }
    pub fn get_player(&self, account_id: AccountId) -> serde_json::Value {
        json!({"cards":self.owned.get(&account_id).unwrap_or_default().iter().filter_map(|id|self.cards.get(id)).collect::<Vec<_>>(),"shards":U128(self.shards.get(&account_id).unwrap_or(0)),"usdc_credit":U128(self.credit(&account_id)),"discoveries":self.counts.get(&account_id).unwrap_or(0),"starter_claimed":self.claims.contains(&format!("starter:{account_id}")),"first_win":self.claims.contains(&format!("first-win:{account_id}")),"claims":(["first","three","battle"].iter().filter(|task|self.claims.contains(&format!("task:{account_id}:{task}"))).collect::<Vec<_>>()),"locked_ids":self.owned.get(&account_id).unwrap_or_default().iter().filter(|id|self.locks.contains(id)).collect::<Vec<_>>(),"boss_reward_token":self.discoveries.get(&format!("boss-nft:v1:{account_id}")),"raid":self.raids.get(&account_id)})
    }
    pub fn get_discovery(&self, account_id: AccountId, barcode: String) -> Option<Card> {
        let canonical = check_barcode(&barcode);
        self.discoveries
            .get(&format!("v1:{account_id}:{canonical}"))
            .and_then(|id| self.cards.get(&id))
    }
    #[payable]
    pub fn mint_scan(&mut self, barcode: String) -> Card {
        let barcode = check_barcode(&barcode);
        let who = env::predecessor_account_id();
        let key = format!("v1:{who}:{barcode}");
        if let Some(id) = self.discoveries.get(&key) {
            return self.cards.get(&id).unwrap();
        }
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach 0.01 NEAR for storage"
        );
        let card = self.mint(&who, &species(&barcode), &barcode);
        self.discoveries.insert(&key, &card.token_id);
        self.counts
            .insert(&who, &(self.counts.get(&who).unwrap_or(0) + 1));
        event(
            "scan_minted",
            json!({"account_id":who,"token_id":card.token_id,"barcode":barcode}),
        );
        card
    }
    /// Seed finite merchant stock once. No public card or money mint exists.
    pub fn seed_shop(&mut self) {
        require!(env::predecessor_account_id() == self.owner, "Owner only");
        require!(
            !self.claims.contains(&"shop_seeded".into()),
            "Already seeded"
        );
        self.claims.insert(&"shop_seeded".into());
        let koban = self.koban.clone();
        for id in SHOP {
            for _ in 0..3 {
                self.mint(&koban, id, "");
            }
        }
    }
    pub fn get_shop(&self) -> Vec<serde_json::Value> {
        SHOP.iter().map(|id|json!({"cardId":id,"stockCount":self.stock(id).len(),"inStock":!self.stock(id).is_empty(),"buy_price":U128(self.price(id,true)),"sell_price":U128(self.price(id,false))})).collect()
    }
    pub fn quote(&self, card_id: String, direction: String) -> serde_json::Value {
        require!(SHOP.contains(&card_id.as_str()), "Not tradable");
        require!(
            direction == "buy" || direction == "sell",
            "Invalid direction"
        );
        let amount = self.price(&card_id, direction == "buy");
        let stock = self.stock(&card_id).len();
        json!({"amount":U128(amount),"stock":stock,"available":if direction=="buy" {stock>0} else {self.credit(&self.koban)>=amount},"reason":if stock<=1 {"Only one left. Raid demand raises the offer."} else {"Stock and the finite merchant budget set this price."}})
    }
    /// Authenticated NEP-141 receiver. A rejection returns the complete payment.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.usdc,
            "Wrong payment token"
        );
        if msg == "tomo" || msg == "koban" {
            let treasury = if msg == "tomo" {
                self.tomo.clone()
            } else {
                self.koban.clone()
            };
            require!(sender_id == treasury, "Agent funding must come from agent");
            self.add_credit(&treasury, amount.0);
            event(
                "agent_funded",
                json!({"account_id":sender_id,"amount":amount}),
            );
            return PromiseOrValue::Value(U128(0));
        }
        let data: serde_json::Value = match serde_json::from_str(&msg) {
            Ok(v) => v,
            Err(_) => return PromiseOrValue::Value(amount),
        };
        if data["action"] == "buy" {
            let card_id = data["card_id"].as_str().unwrap_or("");
            if !SHOP.contains(&card_id) || amount.0 != self.price(card_id, true) {
                return PromiseOrValue::Value(amount);
            }
            let id = match self.stock(card_id).first() {
                Some(id) => id.clone(),
                None => return PromiseOrValue::Value(amount),
            };
            if self.owned.get(&sender_id).unwrap_or_default().len() >= 512 {
                return PromiseOrValue::Value(amount);
            }
            let koban = self.koban.clone();
            self.move_card(&koban, &sender_id, &id);
            self.add_credit(&koban, amount.0);
            event(
                "trade",
                json!({"account_id":sender_id,"direction":"buy","token_id":id,"amount":amount}),
            );
            return PromiseOrValue::Value(U128(0));
        }
        if data["action"] == "listing" {
            let id = data["listing_id"].as_str().unwrap_or("").to_string();
            if let Some(listing) = self.listings.get(&id) {
                if amount == listing.price
                    && sender_id != listing.seller
                    && self.owned.get(&sender_id).unwrap_or_default().len() < 512
                {
                    let contract = env::current_account_id();
                    self.move_card(&contract, &sender_id, &listing.token_id);
                    self.add_credit(&listing.seller, amount.0);
                    self.listings.remove(&id);
                    self.listing_ids.retain(|x| x != &id);
                    event(
                        "listing_bought",
                        json!({"account_id":sender_id,"seller":listing.seller,"token_id":listing.token_id,"amount":amount}),
                    );
                    return PromiseOrValue::Value(U128(0));
                }
            }
        }
        PromiseOrValue::Value(amount)
    }
    #[payable]
    pub fn sell_to_koban(&mut self, token_id: String, expected_price: U128) -> Promise {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        let card = self.cards.get(&token_id).expect("Unknown card");
        require!(card.owner_id == who, "Not your card");
        require!(SHOP.contains(&card.card_id.as_str()), "Not tradable");
        require!(!self.locks.contains(&token_id), "Card locked in raid");
        let price = self.price(&card.card_id, false);
        require!(expected_price.0 == price, "Price changed. Ask again");
        let treasury = self.koban.clone();
        self.debit(&treasury, price);
        require!(
            !self.pending_payments.contains(&who),
            "Payout already pending"
        );
        let contract = env::current_account_id();
        self.move_card(&who, &contract, &token_id);
        self.reserve(&who);
        self.reserve(&treasury);
        self.pay(Payment {
            receiver: who,
            treasury,
            amount: U128(price),
            kind: "sell".into(),
            claim_key: String::new(),
            token_id: Some(token_id),
            shards: U128(0),
        })
    }
    /// One starter grant per account, paid from the SAME global Tomo pool as quests.
    /// No state-layout change: claims, credits, and pending payments already exist.
    #[payable]
    pub fn claim_starter(&mut self) -> Promise {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach 0.01 NEAR storage"
        );
        let who = env::predecessor_account_id();
        let key = format!("starter:{who}");
        require!(
            !self.claims.contains(&key),
            "Starter USDC already claimed or pending"
        );
        require!(
            !self.pending_payments.contains(&who),
            "Payout already pending"
        );
        let treasury = self.tomo.clone();
        self.debit(&treasury, 25 * UNIT);
        self.claims.insert(&key);
        self.pending_payments.insert(&who);
        let payment = Payment {
            receiver: who.clone(),
            treasury,
            amount: U128(25 * UNIT),
            kind: "faucet".into(),
            claim_key: key,
            token_id: None,
            shards: U128(0),
        };
        Promise::new(self.usdc.clone())
            .function_call(
                "has_faucet_claimed",
                serde_json::to_vec(&json!({"account_id":who})).unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(5),
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "resolve_starter_eligibility",
                serde_json::to_vec(&json!({"payment":payment})).unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(90),
            ))
    }
    #[private]
    pub fn resolve_starter_eligibility(&mut self, payment: Payment) -> PromiseOrValue<bool> {
        let legacy = env::promise_result_checked(0, 1024)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<bool>(&bytes).ok());
        self.pending_payments.remove(&payment.receiver);
        if legacy != Some(false) {
            self.add_credit(&payment.treasury, payment.amount.0);
            if legacy.is_none() {
                self.claims.remove(&payment.claim_key);
            }
            event(
                "starter_rejected",
                json!({"account_id":payment.receiver,"already_claimed":legacy==Some(true)}),
            );
            return PromiseOrValue::Value(false);
        }
        PromiseOrValue::Promise(self.pay(payment))
    }
    #[payable]
    pub fn claim_task(&mut self, task_id: String) -> Promise {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach 0.01 NEAR storage"
        );
        let who = env::predecessor_account_id();
        let count = self.counts.get(&who).unwrap_or(0);
        let reward = match task_id.as_str() {
            "first" => {
                require!(count >= 1, "Mint a discovery first");
                1
            }
            "three" => {
                require!(count >= 3, "Mint three different discoveries");
                2
            }
            "battle" => {
                require!(
                    self.claims.contains(&format!("first-win:{who}")),
                    "Claim raid loot first"
                );
                2
            }
            _ => env::panic_str("Unknown task"),
        };
        let key = format!("task:{who}:{task_id}");
        require!(!self.claims.contains(&key), "Already claimed or pending");
        let treasury = self.tomo.clone();
        self.debit(&treasury, reward * UNIT);
        self.claims.insert(&key);
        self.pay(Payment {
            receiver: who,
            treasury,
            amount: U128(reward * UNIT),
            kind: "quest".into(),
            claim_key: key,
            token_id: None,
            shards: U128(reward * 5),
        })
    }
    #[payable]
    pub fn withdraw_usdc(&mut self) -> Promise {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        let amount = self.credit(&who);
        require!(amount > 0, "No USDC credit");
        self.debit(&who, amount);
        self.pay(Payment {
            receiver: who.clone(),
            treasury: who,
            amount: U128(amount),
            kind: "withdraw".into(),
            claim_key: String::new(),
            token_id: None,
            shards: U128(0),
        })
    }
    #[private]
    pub fn resolve_payment(&mut self, payment: Payment) -> bool {
        self.pending_payments.remove(&payment.receiver);
        if payment.kind == "sell" {
            self.unreserve(&payment.receiver);
            self.unreserve(&payment.treasury);
        }
        let ok = env::promise_result_checked(0, 4096).is_ok();
        if !ok {
            self.add_credit(&payment.treasury, payment.amount.0);
            if !payment.claim_key.is_empty() {
                self.claims.remove(&payment.claim_key);
            }
            if payment.kind == "sell" {
                let contract = env::current_account_id();
                self.move_card(
                    &contract,
                    &payment.receiver,
                    payment.token_id.as_ref().unwrap(),
                );
            }
            if payment.kind == "loot" {
                if let Some(mut raid) = self.raids.get(&payment.receiver) {
                    raid.reward = Some(Reward {
                        status: "failed".into(),
                        text: "Payout failed. Register USDC storage and retry.".into(),
                    });
                    self.raids.insert(&payment.receiver, &raid);
                }
            }
            event(
                "payout_failed",
                json!({"account_id":payment.receiver,"kind":payment.kind}),
            );
            return false;
        }
        if payment.shards.0 > 0 {
            self.shards.insert(
                &payment.receiver,
                &(self.shards.get(&payment.receiver).unwrap_or(0) + payment.shards.0),
            );
            mt_event(
                "mt_mint",
                json!({"owner_id":payment.receiver,"token_ids":["shards"],"amounts":[payment.shards]}),
            );
        }
        if payment.kind == "sell" {
            let contract = env::current_account_id();
            let koban = self.koban.clone();
            self.move_card(&contract, &koban, payment.token_id.as_ref().unwrap());
        }
        if payment.kind == "loot" {
            self.claims
                .insert(&format!("first-win:{}", payment.receiver));
            if let Some(mut raid) = self.raids.get(&payment.receiver) {
                raid.reward = Some(Reward {
                    status: "granted".into(),
                    text: "2 USDC + 10 Shards claimed".into(),
                });
                self.raids.insert(&payment.receiver, &raid);
            }
        }
        if payment.kind == "quest" || payment.kind == "loot" || payment.kind == "faucet" {
            self.distributed += payment.amount.0;
        }
        event(
            "payout",
            json!({"account_id":payment.receiver,"from":payment.treasury,"amount":payment.amount,"shards":payment.shards,"kind":payment.kind}),
        );
        true
    }
    #[payable]
    pub fn start_raid(&mut self, team_ids: Vec<String>) -> Raid {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach 0.01 NEAR storage"
        );
        let who = env::predecessor_account_id();
        if let Some(old) = self.raids.get(&who) {
            require!(
                old.reward.as_ref().map(|r| r.status.as_str()) != Some("pending"),
                "Loot payout pending"
            );
            for f in old.team {
                self.locks.remove(&f.instance_id);
            }
        }
        require!(team_ids.len() == 3, "Choose 3 cards");
        require!(
            team_ids
                .iter()
                .enumerate()
                .all(|(i, id)| !team_ids[..i].contains(id)),
            "Duplicate card"
        );
        let team = team_ids
            .iter()
            .map(|id| {
                let card = self.cards.get(id).expect("Unknown card");
                require!(card.owner_id == who, "Not your card");
                require!(!self.inflight.contains(id), "Transfer still resolving");
                self.locks.insert(id);
                Fighter {
                    instance_id: id.clone(),
                    hp: 120,
                    max_hp: 120,
                    skill: Skill {
                        id: "strike".into(),
                        name: if card.card_id == "pikachu" {
                            "Thunder Strike"
                        } else {
                            "Rift Strike"
                        }
                        .into(),
                    },
                }
            })
            .collect();
        self.counter += 1;
        let raid = Raid {
            id: format!("raid:{}", self.counter),
            round: 1,
            phase: "choosing".into(),
            boss_hp: 360,
            boss_max_hp: 360,
            heavy_attack_warning: None,
            status: "Choose a monster, then confirm its skill.".into(),
            team,
            reward: None,
            effect: None,
        };
        self.raids.insert(&who, &raid);
        raid
    }
    #[payable]
    pub fn attack(
        &mut self,
        battle_id: String,
        round: u32,
        instance_id: String,
        skill_id: String,
    ) -> Raid {
        assert_one_yocto();
        self.resolve_raid_attack(battle_id, round, instance_id, skill_id)
    }
    fn resolve_raid_attack(
        &mut self,
        battle_id: String,
        round: u32,
        instance_id: String,
        skill_id: String,
    ) -> Raid {
        let who = env::predecessor_account_id();
        let mut raid = self.raids.get(&who).expect("Start a raid");
        require!(
            raid.id == battle_id && raid.round == round && raid.phase == "choosing",
            "Stale round"
        );
        require!(skill_id == "strike", "Invalid skill");
        let index = raid
            .team
            .iter()
            .position(|f| f.instance_id == instance_id && f.hp > 0)
            .expect("Choose a living monster");
        let card = self.cards.get(&instance_id).unwrap();
        require!(card.owner_id == who, "Ownership changed");
        let damage = if card.card_id == "pikachu" { 85 } else { 65 };
        raid.boss_hp = raid.boss_hp.saturating_sub(damage);
        raid.effect = Some(Effect {
            id: format!("{}:{round}", raid.id),
            source: card.card_id,
            hit: true,
        });
        if raid.boss_hp == 0 {
            raid.phase = "won".into();
            raid.status = "Boss defeated! Claim the on-chain loot.".into();
        } else {
            let heavy = round % 3 == 0;
            let hit = if heavy { 50 } else { 25 };
            raid.team[index].hp = raid.team[index].hp.saturating_sub(hit);
            raid.status = format!("You dealt {damage} damage. Boss dealt {hit} damage.");
            if raid.team.iter().all(|f| f.hp == 0) {
                raid.phase = "lost".into();
                raid.status = "Team defeated. Try a different skill order.".into();
            }
        }
        raid.round += 1;
        raid.heavy_attack_warning = if raid.phase == "choosing" && raid.round % 3 == 0 {
            Some("Heavy strike next! Switch to a healthy monster.".into())
        } else {
            None
        };
        if raid.phase != "choosing" {
            for f in &raid.team {
                self.locks.remove(&f.instance_id);
            }
        }
        self.raids.insert(&who, &raid);
        raid
    }
    /// One wallet transaction: replay a bounded transcript, validate victory,
    /// then mint the unique first-clear boss collectible. No client HP is trusted.
    #[payable]
    pub fn claim_boss_reward(&mut self, team_ids: Vec<String>, actions: Vec<RaidAction>) -> Card {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach 0.01 NEAR storage"
        );
        let who = env::predecessor_account_id();
        let key = format!("boss-nft:v1:{who}");
        // Retried receipts never mint a second NFT, even after the first was traded.
        if let Some(token_id) = self.discoveries.get(&key) {
            let card = self.cards.get(&token_id).expect("Reward token missing");
            event(
                "boss_reward",
                json!({"account_id":who,"token_id":card.token_id,"already_claimed":true}),
            );
            return card;
        }
        require!(
            !actions.is_empty() && actions.len() <= 32,
            "Invalid raid transcript length"
        );
        let mut raid = self.start_raid(team_ids);
        for action in actions {
            raid =
                self.resolve_raid_attack(raid.id, raid.round, action.instance_id, action.skill_id);
        }
        require!(raid.phase == "won", "Win the raid before claiming");
        let card = self.mint(&who, "almarts27-hamster-boss", "boss:first-clear:v1");
        self.discoveries.insert(&key, &card.token_id);
        self.claims.insert(&format!("first-win:{who}"));
        raid.reward = Some(Reward {
            status: "granted".into(),
            text: "Boss NFT added to your vault".into(),
        });
        self.raids.insert(&who, &raid);
        event(
            "boss_reward",
            json!({"account_id":who,"token_id":card.token_id,"already_claimed":false}),
        );
        card
    }
    #[payable]
    pub fn claim_loot(&mut self) -> Promise {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach 0.01 NEAR storage"
        );
        let who = env::predecessor_account_id();
        let mut raid = self.raids.get(&who).expect("No raid");
        require!(raid.phase == "won", "Win the raid first");
        require!(
            raid.team.iter().all(|f| self
                .cards
                .get(&f.instance_id)
                .map(|c| c.owner_id == who)
                .unwrap_or(false)),
            "Team ownership changed"
        );
        let key = format!("loot:{who}:{}", env::block_timestamp() / 86_400_000_000_000);
        require!(!self.claims.contains(&key), "Daily loot claimed or pending");
        require!(
            raid.reward.as_ref().map(|r| r.status.as_str()) != Some("granted"),
            "Raid loot already claimed"
        );
        let treasury = self.tomo.clone();
        self.debit(&treasury, 2 * UNIT);
        self.claims.insert(&key);
        raid.reward = Some(Reward {
            status: "pending".into(),
            text: "Confirming loot payout".into(),
        });
        self.raids.insert(&who, &raid);
        self.pay(Payment {
            receiver: who,
            treasury,
            amount: U128(2 * UNIT),
            kind: "loot".into(),
            claim_key: key,
            token_id: None,
            shards: U128(10),
        })
    }
    #[payable]
    pub fn list_card(&mut self, token_id: String, price: U128) -> Listing {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach 0.01 NEAR storage"
        );
        require!(price.0 > 0, "Positive price required");
        require!(self.listing_ids.len() < 256, "Market full");
        let who = env::predecessor_account_id();
        require!(!self.locks.contains(&token_id), "Card in raid");
        let card = self.cards.get(&token_id).expect("Unknown card");
        require!(
            SHOP.contains(&card.card_id.as_str()),
            "Boss card not tradable"
        );
        let contract = env::current_account_id();
        self.move_card(&who, &contract, &token_id);
        self.counter += 1;
        let listing = Listing {
            id: format!("listing:{}", self.counter),
            seller: who,
            token_id,
            price,
        };
        self.listings.insert(&listing.id, &listing);
        self.listing_ids.push(listing.id.clone());
        listing
    }
    #[payable]
    pub fn cancel_listing(&mut self, listing_id: String) {
        assert_one_yocto();
        let listing = self.listings.get(&listing_id).expect("Unknown listing");
        require!(
            env::predecessor_account_id() == listing.seller,
            "Seller only"
        );
        let contract = env::current_account_id();
        self.move_card(&contract, &listing.seller, &listing.token_id);
        self.listings.remove(&listing_id);
        self.listing_ids.retain(|id| id != &listing_id);
    }
    pub fn get_listings(&self) -> Vec<serde_json::Value> {
        self.listing_ids
            .iter()
            .filter_map(|id| self.listings.get(id))
            .map(|l| json!({"listing":l,"card":self.cards.get(&l.token_id)}))
            .collect()
    }
    // NEP-245 core, including guarded batch transfer and refund resolver. Approval extension is not implemented.
    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<serde_json::Value>> {
        require!(token_ids.len() <= 100, "Max 100");
        token_ids
            .iter()
            .map(|id| {
                if id == "shards" {
                    Some(json!({"token_id":"shards","owner_id":null}))
                } else {
                    self.cards.get(id).map(|c| json!(c))
                }
            })
            .collect()
    }
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        if token_id == "shards" {
            U128(self.shards.get(&account_id).unwrap_or(0))
        } else {
            U128(
                if self
                    .cards
                    .get(&token_id)
                    .map(|c| c.owner_id == account_id)
                    .unwrap_or(false)
                {
                    1
                } else {
                    0
                },
            )
        }
    }
    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        require!(token_ids.len() <= 100, "Max 100");
        token_ids
            .into_iter()
            .map(|id| self.mt_balance_of(account_id.clone(), id))
            .collect()
    }
    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        if token_id == "shards" {
            Some(U128(self.distributed / UNIT * 5))
        } else {
            self.cards.get(&token_id).map(|_| U128(1))
        }
    }
    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        require!(token_ids.len() <= 100, "Max 100");
        token_ids.into_iter().map(|id| self.mt_supply(id)).collect()
    }
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        self.mt_batch_transfer(
            receiver_id,
            vec![token_id],
            vec![amount],
            approval.map(|a| vec![Some(a)]),
            memo,
        );
    }
    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        let sender = env::predecessor_account_id();
        require!(
            receiver_id != env::current_account_id(),
            "Use marketplace methods for escrow"
        );
        require!(approvals.is_none(), "Approvals not supported");
        require!(
            memo.as_ref().map(|x| x.len()).unwrap_or(0) <= 256,
            "Memo too long"
        );
        self.transfer_batch(&sender, &receiver_id, &token_ids, &amounts);
    }
    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        self.mt_batch_transfer_call(
            receiver_id,
            vec![token_id],
            vec![amount],
            approval.map(|a| vec![Some(a)]),
            memo,
            msg,
        )
    }
    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        require!(msg.len() <= 2048, "Message too long");
        require!(env::prepaid_gas() >= Gas::from_tgas(100), "Attach 100 Tgas");
        let sender = env::predecessor_account_id();
        self.mt_batch_transfer(
            receiver_id.clone(),
            token_ids.clone(),
            amounts.clone(),
            approvals,
            memo,
        );
        for id in &token_ids {
            if id != "shards" {
                require!(self.inflight.insert(id), "Transfer already pending");
                self.reserve(&sender);
            }
        }
        Promise::new(receiver_id.clone()).function_call("mt_on_transfer",serde_json::to_vec(&json!({"sender_id":sender,"previous_owner_ids":vec![sender.clone();token_ids.len()],"token_ids":token_ids,"amounts":amounts,"msg":msg})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(40)).then(Promise::new(env::current_account_id()).function_call("mt_resolve_transfer",serde_json::to_vec(&json!({"sender_id":sender,"receiver_id":receiver_id,"token_ids":token_ids,"amounts":amounts})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(30)))
    }
    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
    ) -> Vec<U128> {
        let unused: Vec<U128> = match env::promise_result_checked(0, 4096) {
            Ok(bytes) => serde_json::from_slice::<Vec<U128>>(&bytes)
                .ok()
                .filter(|v| v.len() == amounts.len())
                .unwrap_or(amounts.clone()),
            _ => amounts.clone(),
        };
        for id in &token_ids {
            if id != "shards" {
                self.inflight.remove(id);
                self.unreserve(&sender_id);
            }
        }
        token_ids.iter().zip(amounts).zip(unused).map(|((id,amount),unused)|{let refund=unused.0.min(amount.0).min(self.mt_balance_of(receiver_id.clone(),id.clone()).0);if refund>0 {if id=="shards" {let n=self.shards.get(&receiver_id).unwrap_or(0);self.shards.insert(&receiver_id,&(n-refund));self.shards.insert(&sender_id,&(self.shards.get(&sender_id).unwrap_or(0)+refund));mt_event("mt_transfer",json!({"old_owner_id":receiver_id,"new_owner_id":sender_id,"token_ids":[id],"amounts":[U128(refund)]}));}else{self.move_card(&receiver_id,&sender_id,id);}}U128(amount.0-refund)}).collect()
    }
}
impl Game {
    fn reserve(&mut self, who: &AccountId) {
        let n = self.reserved.get(who).unwrap_or(0);
        require!(
            self.owned.get(who).unwrap_or_default().len() + (n as usize) < 512,
            "Collection full"
        );
        self.reserved.insert(who, &(n + 1));
    }
    fn unreserve(&mut self, who: &AccountId) {
        let n = self.reserved.get(who).unwrap_or(0);
        if n <= 1 {
            self.reserved.remove(who);
        } else {
            self.reserved.insert(who, &(n - 1));
        }
    }
    fn credit(&self, who: &AccountId) -> u128 {
        self.credits.get(who).unwrap_or(0)
    }
    fn add_credit(&mut self, who: &AccountId, amount: u128) {
        self.credits.insert(
            who,
            &self.credit(who).checked_add(amount).expect("Overflow"),
        );
    }
    fn debit(&mut self, who: &AccountId, amount: u128) {
        let n = self.credit(who);
        require!(n >= amount, "Buying paused: agent budget exhausted");
        self.credits.insert(who, &(n - amount));
    }
    fn mint(&mut self, who: &AccountId, card_id: &str, barcode: &str) -> Card {
        let mut ids = self.owned.get(who).unwrap_or_default();
        require!(
            ids.len() + (self.reserved.get(who).unwrap_or(0) as usize) < 512,
            "Collection full"
        );
        self.counter += 1;
        let card = Card {
            token_id: format!("card:{}", self.counter),
            card_id: card_id.into(),
            barcode: barcode.into(),
            owner_id: who.clone(),
        };
        ids.push(card.token_id.clone());
        self.owned.insert(who, &ids);
        self.cards.insert(&card.token_id, &card);
        mt_event(
            "mt_mint",
            json!({"owner_id":who,"token_ids":[card.token_id],"amounts":["1"]}),
        );
        card
    }
    fn move_card(&mut self, from: &AccountId, to: &AccountId, id: &String) {
        require!(from != to, "Self transfer");
        require!(!self.locks.contains(id), "Card locked in raid");
        let mut card = self.cards.get(id).expect("Unknown token");
        require!(&card.owner_id == from, "Not token owner");
        let mut dest = self.owned.get(to).unwrap_or_default();
        require!(
            dest.len() + (self.reserved.get(to).unwrap_or(0) as usize) < 512,
            "Collection full"
        );
        let mut source = self.owned.get(from).unwrap_or_default();
        source.retain(|x| x != id);
        dest.push(id.clone());
        card.owner_id = to.clone();
        self.cards.insert(id, &card);
        if source.is_empty() {
            self.owned.remove(from);
        } else {
            self.owned.insert(from, &source);
        }
        self.owned.insert(to, &dest);
        mt_event(
            "mt_transfer",
            json!({"old_owner_id":from,"new_owner_id":to,"token_ids":[id],"amounts":["1"]}),
        );
    }
    fn stock(&self, card_id: &str) -> Vec<String> {
        self.owned
            .get(&self.koban)
            .unwrap_or_default()
            .into_iter()
            .filter(|id| {
                self.cards
                    .get(id)
                    .map(|c| c.card_id == card_id)
                    .unwrap_or(false)
            })
            .collect()
    }
    fn price(&self, id: &str, buy: bool) -> u128 {
        let base = match id {
            "pikachu" => 4_500_000,
            "doge" => 4_000_000,
            "gengar" => 3_800_000,
            "nyan-cat" => 3_500_000,
            "veemon" => 3_400_000,
            "chill-guy" => 3_300_000,
            "pepe" => 3_200_000,
            _ => 3_000_000,
        };
        let stock = self.stock(id).len() as u128;
        let demand = if id == "pikachu" { 120 } else { 100 };
        let price = base * demand / 100 * 10 / (8 + stock.min(20));
        if buy {
            price
        } else {
            price * 75 / 100
        }
    }
    fn pay(&mut self, payment: Payment) -> Promise {
        require!(
            self.pending_payments.insert(&payment.receiver),
            "Payout already pending"
        );
        Promise::new(self.usdc.clone()).function_call("ft_transfer",serde_json::to_vec(&json!({"receiver_id":payment.receiver,"amount":payment.amount,"memo":format!("scanMon {}",payment.kind)})).unwrap(),NearToken::from_yoctonear(1),Gas::from_tgas(25)).then(Promise::new(env::current_account_id()).function_call("resolve_payment",serde_json::to_vec(&json!({"payment":payment})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(40)))
    }
    fn transfer_batch(
        &mut self,
        from: &AccountId,
        to: &AccountId,
        ids: &[String],
        amounts: &[U128],
    ) {
        require!(
            !ids.is_empty() && ids.len() <= 20 && ids.len() == amounts.len(),
            "Invalid batch"
        );
        for (i, (id, amount)) in ids.iter().zip(amounts).enumerate() {
            require!(
                !ids[..i].contains(id) && amount.0 > 0,
                "Duplicate or zero amount"
            );
            if id == "shards" {
                let n = self.shards.get(from).unwrap_or(0);
                require!(n >= amount.0, "Insufficient shards");
                if n == amount.0 {
                    self.shards.remove(from);
                } else {
                    self.shards.insert(from, &(n - amount.0));
                }
                self.shards
                    .insert(to, &(self.shards.get(to).unwrap_or(0) + amount.0));
                mt_event(
                    "mt_transfer",
                    json!({"old_owner_id":from,"new_owner_id":to,"token_ids":[id],"amounts":[amount]}),
                );
            } else {
                require!(amount.0 == 1, "Cards have supply 1");
                self.move_card(from, to, id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};
    fn account(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn ctx(who: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(account("game.testnet"))
            .predecessor_account_id(account(who))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .prepaid_gas(Gas::from_tgas(300))
            .build());
    }
    fn game() -> Game {
        ctx("owner.testnet", 0);
        Game::new(
            account("owner.testnet"),
            account("usdc.testnet"),
            account("tomo.testnet"),
            account("koban.testnet"),
            account("sponsor.testnet"),
        )
    }
    fn raid_team(g: &mut Game) -> Vec<String> {
        ctx("alice.testnet", STORAGE);
        ["pikachu", "veemon", "gengar"]
            .iter()
            .map(|species| g.mint(&account("alice.testnet"), species, "").token_id)
            .collect()
    }
    fn winning_actions(ids: &[String]) -> Vec<RaidAction> {
        [0, 0, 0, 1, 1]
            .iter()
            .map(|i| RaidAction {
                instance_id: ids[*i].clone(),
                skill_id: "strike".into(),
            })
            .collect()
    }
    #[test]
    fn single_claim_replays_victory_and_mints_first_clear_nft_once() {
        let mut g = game();
        let ids = raid_team(&mut g);
        let reward = g.claim_boss_reward(ids.clone(), winning_actions(&ids));
        assert_eq!(reward.card_id, "almarts27-hamster-boss");
        assert_eq!(reward.owner_id, account("alice.testnet"));
        let raid = g.raids.get(&account("alice.testnet")).unwrap();
        assert_eq!(
            (raid.round, raid.boss_hp, raid.team[0].hp, raid.team[1].hp),
            (6, 0, 20, 95)
        );
        assert_eq!(raid.reward.unwrap().status, "granted");
        assert!(ids.iter().all(|id| !g.locks.contains(id)));
        assert!(g.claims.contains(&"first-win:alice.testnet".into()));
        let retry = g.claim_boss_reward(ids.clone(), winning_actions(&ids));
        assert_eq!(reward.token_id, retry.token_id);
        assert_eq!(g.owned.get(&account("alice.testnet")).unwrap().len(), 4);
        g.move_card(
            &account("alice.testnet"),
            &account("bob.testnet"),
            &reward.token_id,
        );
        let retry_after_trade = g.claim_boss_reward(ids.clone(), winning_actions(&ids));
        assert_eq!(retry_after_trade.token_id, reward.token_id);
        assert_eq!(g.owned.get(&account("alice.testnet")).unwrap().len(), 3);
    }
    #[test]
    #[should_panic(expected = "Win the raid before claiming")]
    fn boss_claim_rejects_incomplete_win() {
        let mut g = game();
        let ids = raid_team(&mut g);
        g.claim_boss_reward(
            ids.clone(),
            vec![RaidAction {
                instance_id: ids[0].clone(),
                skill_id: "strike".into(),
            }],
        );
    }
    #[test]
    #[should_panic(expected = "Not your card")]
    fn boss_claim_rejects_sold_team_card() {
        let mut g = game();
        let ids = raid_team(&mut g);
        g.move_card(&account("alice.testnet"), &account("bob.testnet"), &ids[1]);
        g.claim_boss_reward(ids.clone(), winning_actions(&ids));
    }
    #[test]
    #[should_panic(expected = "Transfer still resolving")]
    fn boss_claim_rejects_pending_transfer() {
        let mut g = game();
        let ids = raid_team(&mut g);
        g.inflight.insert(&ids[0]);
        g.claim_boss_reward(ids.clone(), winning_actions(&ids));
    }
    #[test]
    #[should_panic(expected = "Invalid skill")]
    fn boss_claim_rejects_forged_skill() {
        let mut g = game();
        let ids = raid_team(&mut g);
        g.claim_boss_reward(
            ids.clone(),
            vec![RaidAction {
                instance_id: ids[0].clone(),
                skill_id: "instant-win".into(),
            }],
        );
    }
    #[test]
    #[should_panic(expected = "Choose a living monster")]
    fn boss_claim_rejects_dead_actor() {
        let mut g = game();
        let ids = raid_team(&mut g);
        let actions = (0..5)
            .map(|_| RaidAction {
                instance_id: ids[0].clone(),
                skill_id: "strike".into(),
            })
            .collect();
        g.claim_boss_reward(ids, actions);
    }
    #[test]
    #[should_panic(expected = "Duplicate card")]
    fn boss_claim_rejects_duplicate_team() {
        let mut g = game();
        let ids = raid_team(&mut g);
        g.claim_boss_reward(vec![ids[0].clone(); 3], winning_actions(&ids));
    }
    #[test]
    #[should_panic(expected = "Invalid raid transcript length")]
    fn boss_claim_bounds_replay_gas() {
        let mut g = game();
        let ids = raid_team(&mut g);
        let actions = (0..33)
            .map(|_| RaidAction {
                instance_id: ids[0].clone(),
                skill_id: "strike".into(),
            })
            .collect();
        g.claim_boss_reward(ids, actions);
    }
    #[test]
    fn duplicate_barcode_never_mints_twice() {
        let mut g = game();
        ctx("alice.testnet", STORAGE);
        let a = g.mint_scan("4006381333931".into());
        let b = g.mint_scan("4006381333931".into());
        assert_eq!(a.token_id, b.token_id);
        assert_eq!(g.counts.get(&account("alice.testnet")), Some(1));
    }
    #[test]
    fn upc_and_ean_normalize() {
        assert_eq!(check_barcode("036000291452"), "0036000291452");
    }
    #[test]
    #[should_panic(expected = "checksum")]
    fn bad_checksum() {
        check_barcode("4006381333932");
    }
    #[test]
    #[should_panic(expected = "Wrong payment token")]
    fn spoofed_ft_rejected() {
        let mut g = game();
        ctx("evil.testnet", 0);
        let _ = g.ft_on_transfer(account("alice.testnet"), U128(5 * UNIT), "tomo".into());
    }
    #[test]
    fn price_falls_with_stock() {
        let mut g = game();
        let before = g.price("pikachu", false);
        let koban = g.koban.clone();
        g.mint(&koban, "pikachu", "");
        assert!(g.price("pikachu", false) < before);
    }
    #[test]
    #[should_panic(expected = "budget")]
    fn unfunded_rewards_rejected() {
        let mut g = game();
        ctx("alice.testnet", STORAGE);
        g.mint_scan("4006381333931".into());
        let _ = g.claim_task("first".into());
    }
    #[test]
    fn rejected_buy_refunds_all() {
        let mut g = game();
        ctx("usdc.testnet", 0);
        let r = g.ft_on_transfer(
            account("alice.testnet"),
            U128(1),
            "{\"action\":\"buy\",\"card_id\":\"pikachu\"}".into(),
        );
        assert!(matches!(r, PromiseOrValue::Value(U128(1))));
    }
    #[test]
    #[should_panic(expected = "Not token owner")]
    fn cannot_steal_card() {
        let mut g = game();
        ctx("alice.testnet", STORAGE);
        let c = g.mint_scan("4006381333931".into());
        ctx("evil.testnet", 1);
        g.mt_transfer(account("evil2.testnet"), c.token_id, U128(1), None, None);
    }
    #[allow(deprecated)]
    fn callback(result: near_sdk::PromiseResult) {
        near_sdk::test_utils::testing_env_with_promise_results(
            VMContextBuilder::new()
                .current_account_id(account("game.testnet"))
                .predecessor_account_id(account("game.testnet"))
                .prepaid_gas(Gas::from_tgas(300))
                .build(),
            result,
        );
    }
    fn starter(who: &str) -> Payment {
        Payment {
            receiver: account(who),
            treasury: account("tomo.testnet"),
            amount: U128(25 * UNIT),
            kind: "faucet".into(),
            claim_key: format!("starter:{who}"),
            token_id: None,
            shards: U128(0),
        }
    }
    #[test]
    fn starter_uses_one_global_pool_for_two_users() {
        let mut g = game();
        g.add_credit(&account("tomo.testnet"), 100 * UNIT);
        for who in ["alice.testnet", "bob.testnet"] {
            ctx(who, STORAGE);
            let _ = g.claim_starter();
            callback(near_sdk::PromiseResult::Successful(b"false".to_vec()));
            let _ = g.resolve_starter_eligibility(starter(who));
            callback(near_sdk::PromiseResult::Successful(vec![]));
            assert!(g.resolve_payment(starter(who)));
        }
        assert_eq!(g.credit(&account("tomo.testnet")), 50 * UNIT);
        assert_eq!(g.distributed, 50 * UNIT);
        assert!(g.claims.contains(&"starter:alice.testnet".into()));
        assert!(g.claims.contains(&"starter:bob.testnet".into()));
    }
    #[test]
    fn failed_starter_transfer_refunds_pool_and_allows_retry() {
        let mut g = game();
        g.add_credit(&account("tomo.testnet"), 25 * UNIT);
        ctx("alice.testnet", STORAGE);
        let _ = g.claim_starter();
        assert_eq!(g.credit(&account("tomo.testnet")), 0);
        callback(near_sdk::PromiseResult::Successful(b"false".to_vec()));
        let _ = g.resolve_starter_eligibility(starter("alice.testnet"));
        callback(near_sdk::PromiseResult::Failed);
        assert!(!g.resolve_payment(starter("alice.testnet")));
        assert_eq!(g.credit(&account("tomo.testnet")), 25 * UNIT);
        assert_eq!(g.distributed, 0);
        assert!(!g.claims.contains(&"starter:alice.testnet".into()));
    }
    #[test]
    fn legacy_faucet_cannot_claim_again_from_pool() {
        let mut g = game();
        g.add_credit(&account("tomo.testnet"), 25 * UNIT);
        ctx("alice.testnet", STORAGE);
        let _ = g.claim_starter();
        callback(near_sdk::PromiseResult::Successful(b"true".to_vec()));
        let result = g.resolve_starter_eligibility(starter("alice.testnet"));
        assert!(matches!(result, PromiseOrValue::Value(false)));
        assert_eq!(g.credit(&account("tomo.testnet")), 25 * UNIT);
        assert_eq!(g.distributed, 0);
    }
    #[test]
    #[should_panic(expected = "already claimed")]
    fn duplicate_starter_claim_is_rejected() {
        let mut g = game();
        g.add_credit(&account("tomo.testnet"), 100 * UNIT);
        ctx("alice.testnet", STORAGE);
        let _ = g.claim_starter();
        let _ = g.claim_starter();
    }
}
