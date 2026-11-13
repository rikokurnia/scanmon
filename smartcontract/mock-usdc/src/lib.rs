use near_contract_standards::{
    fungible_token::{
        core::FungibleTokenCore,
        metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC},
        resolver::FungibleTokenResolver,
        FungibleToken,
    },
    storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement},
};
use near_sdk::{
    collections::LookupSet, env, json_types::U128, near, AccountId, NearToken, PanicOnDefault,
    PromiseOrValue,
};

/// Testnet-only NEP-141 USDC mock. Never represents Circle-issued money.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockUsdc {
    token: FungibleToken,
    owner: AccountId,
    faucets: LookupSet<AccountId>,
}

#[near]
impl MockUsdc {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        assert!(
            env::current_account_id().as_str().ends_with(".testnet")
                || env::current_account_id().as_str().len() == 64,
            "Testnet only"
        );
        Self {
            token: FungibleToken::new(b"f"),
            owner: owner_id,
            faucets: LookupSet::new(b"q"),
        }
    }
    #[payable]
    pub fn faucet(&mut self) {
        env::panic_str("Claim starter USDC through the game contract");
    }
    pub fn has_faucet_claimed(&self, account_id: AccountId) -> bool {
        self.faucets.contains(&account_id)
    }
    /// Bootstrap the two finite game agent budgets, only by deployment owner.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner, "Owner only");
        assert!(amount.0 <= 1_000_000_000, "Max 1000 per mint");
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &account_id,
            amount,
            memo: Some("Finite testnet agent funding"),
        }
        .emit();
    }
}
#[near]
impl FungibleTokenCore for MockUsdc {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }
    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenResolver for MockUsdc {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.token
            .ft_resolve_transfer(sender_id, receiver_id, amount)
    }
}
#[near]
impl StorageManagement for MockUsdc {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.storage_unregister(force)
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenMetadataProvider for MockUsdc {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.into(),
            name: "ScanMon Mock USDC (testnet only)".into(),
            symbol: "USDC.mock".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}
