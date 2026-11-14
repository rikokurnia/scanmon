use super::*;
use near_sdk::json_types::U64;
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct PvpPlayer {
    pub account_id: AccountId,
    pub username: String,
    pub stake_id: String,
    pub team_ids: Vec<String>,
    pub card_ids: Vec<String>,
    pub session_key: String,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct PvpRoom {
    pub id: String,
    pub host: PvpPlayer,
    pub guest: Option<PvpPlayer>,
    pub phase: String,
    pub winner: Option<AccountId>,
    pub expires_at: U64,
}
fn rooms() -> LookupMap<String, PvpRoom> {
    LookupMap::new(b"pvp:rooms:v1".to_vec())
}
fn queue() -> LookupMap<String, Vec<String>> {
    LookupMap::new(b"pvp:queue:v1".to_vec())
}
fn names() -> LookupMap<String, AccountId> {
    LookupMap::new(b"pvp:names:v1".to_vec())
}
fn referee() -> LookupMap<String, Vec<u8>> {
    LookupMap::new(b"pvp:referee:v1".to_vec())
}
#[near]
impl Game {
    pub fn pvp_room(&self, room_id: String) -> Option<PvpRoom> {
        rooms().get(&room_id)
    }
    pub fn pvp_rooms(&self) -> Vec<PvpRoom> {
        queue()
            .get(&"open".into())
            .unwrap_or_default()
            .iter()
            .filter_map(|id| rooms().get(id))
            .filter(|r| {
                r.phase == "waiting" && r.expires_at.0 > env::block_timestamp() / 1_000_000_000
            })
            .collect()
    }
    pub fn pvp_for_player(&self, account_id: AccountId) -> Option<PvpRoom> {
        queue()
            .get(&"open".into())
            .unwrap_or_default()
            .iter()
            .filter_map(|id| rooms().get(id))
            .find(|r| {
                (r.phase == "waiting" || r.phase == "active")
                    && (r.host.account_id == account_id
                        || r.guest
                            .as_ref()
                            .map(|g| g.account_id == account_id)
                            .unwrap_or(false))
            })
    }
    #[payable]
    pub fn configure_pvp(&mut self, public_key: Vec<u8>) {
        require!(env::predecessor_account_id() == self.owner, "Owner only");
        require!(public_key.len() == 32, "Invalid referee key");
        referee().insert(&"key".into(), &public_key);
    }
    #[payable]
    pub fn create_pvp(
        &mut self,
        username: String,
        team_ids: Vec<String>,
        stake_id: String,
        session_key: String,
    ) -> PvpRoom {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach storage deposit"
        );
        require!(referee().get(&"key".into()).is_some(), "PvP not configured");
        let open: Vec<String> = queue()
            .get(&"open".into())
            .unwrap_or_default()
            .into_iter()
            .filter(|id| {
                rooms()
                    .get(id)
                    .map(|r| r.phase == "waiting" || r.phase == "active")
                    .unwrap_or(false)
            })
            .collect();
        require!(open.len() < 64, "Rooms full; try again later");
        let player = self.pvp_lock(username, team_ids, stake_id, session_key);
        self.counter += 1;
        let id = format!("pvp:{}", self.counter);
        let room = PvpRoom {
            id: id.clone(),
            host: player,
            guest: None,
            phase: "waiting".into(),
            winner: None,
            expires_at: U64(env::block_timestamp() / 1_000_000_000 + 86400),
        };
        rooms().insert(&id, &room);
        let mut open = open;
        open.push(id);
        queue().insert(&"open".into(), &open);
        room
    }
    #[payable]
    pub fn join_pvp(
        &mut self,
        room_id: String,
        username: String,
        team_ids: Vec<String>,
        stake_id: String,
        session_key: String,
    ) -> PvpRoom {
        require!(
            env::attached_deposit().as_yoctonear() >= STORAGE,
            "Attach storage deposit"
        );
        let mut room = rooms().get(&room_id).expect("Room missing");
        require!(
            room.phase == "waiting" && room.expires_at.0 > env::block_timestamp() / 1_000_000_000,
            "Room unavailable"
        );
        require!(
            room.host.account_id != env::predecessor_account_id(),
            "Choose another player"
        );
        room.guest = Some(self.pvp_lock(username, team_ids, stake_id, session_key));
        room.phase = "active".into();
        rooms().insert(&room_id, &room);
        room
    }
    #[payable]
    pub fn cancel_pvp(&mut self, room_id: String) -> PvpRoom {
        assert_one_yocto();
        let room = rooms().get(&room_id).expect("Room missing");
        require!(
            room.host.account_id == env::predecessor_account_id() && room.phase == "waiting",
            "Only host may cancel a waiting room"
        );
        self.pvp_finish(room, None)
    }
    #[payable]
    pub fn expire_pvp(&mut self, room_id: String) -> PvpRoom {
        assert_one_yocto();
        let room = rooms().get(&room_id).expect("Room missing");
        require!(
            (room.phase == "waiting" || room.phase == "active")
                && env::block_timestamp() / 1_000_000_000 >= room.expires_at.0,
            "Room not expired"
        );
        self.pvp_finish(room, None)
    }
    #[payable]
    pub fn claim_pvp(
        &mut self,
        room_id: String,
        outcome: String,
        expires_at: U64,
        signature: Vec<u8>,
    ) -> PvpRoom {
        assert_one_yocto();
        let room = rooms().get(&room_id).expect("Room missing");
        let who = env::predecessor_account_id();
        require!(
            room.host.account_id == who
                || room
                    .guest
                    .as_ref()
                    .map(|g| g.account_id == who)
                    .unwrap_or(false),
            "Not your match"
        );
        if room.phase == "settled" || room.phase == "cancelled" {
            return room;
        }
        require!(room.phase == "active", "Match not active");
        require!(
            expires_at.0 >= env::block_timestamp() / 1_000_000_000
                && expires_at.0 <= room.expires_at.0,
            "Result expired"
        );
        let key: [u8; 32] = referee()
            .get(&"key".into())
            .expect("Referee unavailable")
            .try_into()
            .expect("Invalid key");
        let sig: [u8; 64] = signature.try_into().expect("Invalid signature");
        let msg = format!(
            "scanmon-pvp:v1|{}|{}|{}|{}",
            env::current_account_id(),
            room_id,
            outcome,
            expires_at.0
        );
        require!(
            env::ed25519_verify(&sig, msg.as_bytes(), &key),
            "Invalid result proof"
        );
        let winner = if outcome == "refund" {
            None
        } else {
            let id: AccountId = outcome.parse().expect("Invalid winner");
            require!(
                id == room.host.account_id
                    || room
                        .guest
                        .as_ref()
                        .map(|g| g.account_id == id)
                        .unwrap_or(false),
                "Invalid winner"
            );
            require!(id == who, "Only winner claims prize");
            Some(id)
        };
        self.pvp_finish(room, winner)
    }
    fn pvp_lock(
        &mut self,
        username: String,
        team_ids: Vec<String>,
        stake_id: String,
        session_key: String,
    ) -> PvpPlayer {
        let who = env::predecessor_account_id();
        require!(
            self.pvp_for_player(who.clone()).is_none(),
            "Finish your current PvP match first"
        );
        require!(
            username.len() >= 3
                && username.len() <= 20
                && username
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
                && username.as_bytes()[0].is_ascii_lowercase(),
            "Invalid username"
        );
        require!(
            names()
                .get(&username)
                .map(|owner| owner == who)
                .unwrap_or(true),
            "Username already used"
        );
        require!(
            session_key.len() == 64 && session_key.bytes().all(|c| c.is_ascii_hexdigit()),
            "Invalid session key"
        );
        require!(
            team_ids.len() == 3
                && team_ids
                    .iter()
                    .enumerate()
                    .all(|(i, id)| !team_ids[..i].contains(id))
                && team_ids.contains(&stake_id),
            "Choose three cards and one team card to stake"
        );
        let card_ids = team_ids
            .iter()
            .map(|id| {
                let card = self.cards.get(id).expect("Unknown card");
                require!(
                    card.owner_id == who && !self.locks.contains(id) && !self.inflight.contains(id),
                    "Card unavailable"
                );
                card.card_id
            })
            .collect();
        require!(
            self.owned.get(&who).unwrap_or_default().len()
                + self.reserved.get(&who).unwrap_or(0) as usize
                <= 510,
            "Leave space for two escrow cards"
        );
        self.reserved
            .insert(&who, &(self.reserved.get(&who).unwrap_or(0) + 2));
        let custody = env::current_account_id();
        self.move_card(&who, &custody, &stake_id);
        for id in &team_ids {
            self.locks.insert(id);
        }
        names().insert(&username, &who);
        PvpPlayer {
            account_id: who,
            username,
            stake_id,
            team_ids,
            card_ids,
            session_key,
        }
    }
    fn pvp_finish(&mut self, mut room: PvpRoom, winner: Option<AccountId>) -> PvpRoom {
        let players: Vec<PvpPlayer> = std::iter::once(room.host.clone())
            .chain(room.guest.clone())
            .collect();
        for p in &players {
            for id in &p.team_ids {
                self.locks.remove(id);
            }
            let n = self.reserved.get(&p.account_id).unwrap_or(0);
            self.reserved.insert(&p.account_id, &n.saturating_sub(2));
        }
        let custody = env::current_account_id();
        for p in &players {
            self.move_card(
                &custody,
                winner.as_ref().unwrap_or(&p.account_id),
                &p.stake_id,
            );
        }
        room.phase = if winner.is_some() {
            "settled"
        } else {
            "cancelled"
        }
        .into();
        room.winner = winner;
        rooms().insert(&room.id, &room);
        event(
            "pvp_settled",
            json!({"account_id":env::predecessor_account_id(),"room_id":room.id,"winner":room.winner}),
        );
        room
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::{test_utils::VMContextBuilder, testing_env};
    fn id(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn ctx(who: &str, time: u64, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(id("game.testnet"))
            .predecessor_account_id(id(who))
            .block_timestamp(time * 1_000_000_000)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .build());
    }
    fn setup() -> (Game, Vec<String>, Vec<String>, SigningKey) {
        ctx("owner.testnet", 1, STORAGE);
        let mut g = Game::new(
            id("owner.testnet"),
            id("usdc.testnet"),
            id("tomo.testnet"),
            id("koban.testnet"),
            id("sponsor.testnet"),
        );
        let key = SigningKey::from_bytes(&[7; 32]);
        g.configure_pvp(key.verifying_key().to_bytes().to_vec());
        let a = (0..3)
            .map(|_| g.mint(&id("alice.testnet"), "pikachu", "").token_id)
            .collect();
        let b = (0..3)
            .map(|_| g.mint(&id("bob.testnet"), "gengar", "").token_id)
            .collect();
        (g, a, b, key)
    }
    fn joined() -> (Game, PvpRoom, SigningKey) {
        let (mut g, a, b, key) = setup();
        ctx("alice.testnet", 1, STORAGE);
        let room = g.create_pvp("alice".into(), a.clone(), a[0].clone(), "11".repeat(32));
        ctx("bob.testnet", 2, STORAGE);
        let room = g.join_pvp(
            room.id,
            "bobby".into(),
            b.clone(),
            b[0].clone(),
            "22".repeat(32),
        );
        (g, room, key)
    }
    fn sig(key: &SigningKey, room: &PvpRoom, result: &str, expires: u64) -> Vec<u8> {
        key.sign(
            format!(
                "scanmon-pvp:v1|game.testnet|{}|{}|{}",
                room.id, result, expires
            )
            .as_bytes(),
        )
        .to_bytes()
        .to_vec()
    }
    #[test]
    fn stakes_move_to_escrow_and_winner_claims_only_once() {
        let (mut g, room, key) = joined();
        assert_eq!(
            g.cards.get(&room.host.stake_id).unwrap().owner_id,
            id("game.testnet")
        );
        assert!(room.host.team_ids.iter().all(|t| g.locks.contains(t)));
        ctx("alice.testnet", 3, 1);
        let result = g.claim_pvp(
            room.id.clone(),
            "alice.testnet".into(),
            U64(200),
            sig(&key, &room, "alice.testnet", 200),
        );
        assert_eq!(result.phase, "settled");
        assert_eq!(g.owned.get(&id("alice.testnet")).unwrap().len(), 4);
        assert_eq!(g.owned.get(&id("bob.testnet")).unwrap().len(), 2);
        g.claim_pvp(room.id, "alice.testnet".into(), U64(200), vec![]);
        assert_eq!(g.owned.get(&id("alice.testnet")).unwrap().len(), 4);
    }
    #[test]
    fn signed_disconnect_refund_returns_both_stakes() {
        let (mut g, room, key) = joined();
        ctx("alice.testnet", 100, 1);
        g.claim_pvp(
            room.id.clone(),
            "refund".into(),
            U64(200),
            sig(&key, &room, "refund", 200),
        );
        for p in [room.host, room.guest.unwrap()] {
            assert_eq!(g.owned.get(&p.account_id).unwrap().len(), 3);
            assert_eq!(g.reserved.get(&p.account_id), Some(0));
            assert!(p.team_ids.iter().all(|t| !g.locks.contains(t)));
        }
    }
    #[test]
    fn host_can_cancel_before_opponent_joins() {
        let (mut g, a, _, _) = setup();
        ctx("alice.testnet", 1, STORAGE);
        let room = g.create_pvp("alice".into(), a.clone(), a[0].clone(), "11".repeat(32));
        ctx("alice.testnet", 2, 1);
        g.cancel_pvp(room.id);
        assert_eq!(g.owned.get(&id("alice.testnet")).unwrap().len(), 3);
    }
    #[test]
    fn offline_backend_has_onchain_expiry_recovery() {
        let (mut g, room, _) = joined();
        ctx("alice.testnet", 90000, 1);
        assert_eq!(g.expire_pvp(room.id).phase, "cancelled");
    }
    #[test]
    #[should_panic(expected = "Invalid result proof")]
    fn forged_result_rejected() {
        let (mut g, room, _) = joined();
        ctx("alice.testnet", 3, 1);
        g.claim_pvp(room.id, "alice.testnet".into(), U64(200), vec![1; 64]);
    }
    #[test]
    #[should_panic(expected = "Only winner claims prize")]
    fn loser_cannot_claim_winners_stake() {
        let (mut g, room, key) = joined();
        ctx("bob.testnet", 3, 1);
        g.claim_pvp(
            room.id.clone(),
            "alice.testnet".into(),
            U64(200),
            sig(&key, &room, "alice.testnet", 200),
        );
    }
    #[test]
    #[should_panic(expected = "Only host may cancel")]
    fn active_match_cannot_be_cancelled_unilaterally() {
        let (mut g, room, _) = joined();
        ctx("alice.testnet", 3, 1);
        g.cancel_pvp(room.id);
    }
    #[test]
    #[should_panic(expected = "Card locked in raid")]
    fn team_cannot_be_transferred_while_staked() {
        let (mut g, room, _) = joined();
        g.move_card(
            &id("alice.testnet"),
            &id("bob.testnet"),
            &room.host.team_ids[1],
        );
    }
}
