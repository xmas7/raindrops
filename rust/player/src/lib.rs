pub mod utils;

use {
    crate::utils::{
        assert_derivation, assert_initialized, assert_owned_by, create_or_allocate_account_raw,
        get_mask_and_index_for_seq, spl_token_burn, spl_token_mint_to, spl_token_transfer,
        TokenBurnParams, TokenTransferParams,
    },
    anchor_lang::{
        prelude::*,
        solana_program::{
            program::{invoke, invoke_signed},
            program_option::COption,
            program_pack::Pack,
            system_instruction, system_program,
        },
        AnchorDeserialize, AnchorSerialize,
    },
    anchor_spl::token::{Mint, TokenAccount},
    metaplex_token_metadata::instruction::{
        create_master_edition, create_metadata_accounts,
        mint_new_edition_from_master_edition_via_token, update_metadata_accounts,
    },
    spl_token::{
        instruction::{initialize_account2, mint_to},
        state::Account,
    },
};

anchor_lang::solana_program::declare_id!("p1exdMJcjVao65QdewkaZRUnU6VPSXhus9n2GzWfh98");

#[program]
pub mod player {
    use super::*;
}

pub const EQUIPPED_ITEM_SIZE: usize = 32 + //item 
32 + // item
25 + //body part
25 + // class of item
32; // padding

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EquippedItem {
    item: Pubkey,
    item_class: Pubkey,
    body_part: String,
    category: String,
    padding: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum UpdatePermissiveness {
    TokenHolderCanUpdate { inherited: InheritanceState },
    PlayerClassHolderCanUpdate { inherited: InheritanceState },
    AnybodyCanUpdate { inherited: InheritanceState },
}

pub const MAX_NAMESPACES: usize = 10;
pub const PLAYER_CLASS_INDEX_SIZE: usize = 8 + MAX_NAMESPACES * 32;

/// To create in a namespaced player you must have namespace signer and hold
/// the NFT OR have your namespace whitelisted in the index.
/// seed ['player', player program, mint]
#[account]
pub struct PlayerClassIndex {
    namespaces: Vec<Pubkey>,
}

/// Seed ['player', player program, mint, namespace, 'whitelist']
#[account]
pub struct PlayerClassNamespaceWhitelist {
    namespace: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum ChildUpdatePropagationPermissiveness {
    Class { overridable: bool },
    Usages { overridable: bool },
    Components { overridable: bool },
    UpdatePermissiveness { overridable: bool },
    ChildUpdatePropagationPermissiveness { overridable: bool },
    Uri { overridable: bool },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum InheritanceState {
    NotInherited,
    Inherited,
    Overriden,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PlayerCategory {
    category: String,
    inherited: InheritanceState,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StatsUri {
    stats_uri: String,
    inherited: InheritanceState,
}

/// seed ['player', player program, mint, namespace]
#[account]
pub struct PlayerClass {
    mint: Pubkey,
    metadata: Pubkey,
    edition: Pubkey,
    starting_stats_uri: StatsUri,
    default_category: PlayerCategory,
    namespace: Pubkey,
    indexed: bool,
    default_update_permissiveness: UpdatePermissiveness,
    child_update_propagation_permissiveness: Vec<ChildUpdatePropagationPermissiveness>,
    parent: Option<Pubkey>,
}

/// seed ['player', player program, mint, namespace] also
#[account]
pub struct Player {
    mint: Pubkey,
    metadata: Pubkey,
    edition: Pubkey,
    parent: Pubkey,
    stats_uri: StatsUri,
    indexed: bool,
    category: Option<PlayerCategory>,
    update_permissiveness: Option<UpdatePermissiveness>,
    equipped_items: Vec<EquippedItem>,
    basic_stats: Vec<BasicStat>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BasicStat {
    name: String,
    stat_type: BasicStatType,
    inherited: InheritanceState,
}

pub const BASIC_STAT_TYPE_SIZE: usize = 64;
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum BasicStatType {
    Enum {
        initial: u8,
        values: Vec<String>,
    },
    Integer {
        min: Option<i64>,
        max: Option<i64>,
        initial: i64,
        padding: [u8; 32],
        padding2: [u8; 8],
    },
    Bool {
        initial: bool,
        padding: [u8; 32],
        padding2: [u8; 31],
    },
    String {
        initial: String,
    },
}

#[error]
pub enum ErrorCode {
    #[msg("Account does not have correct owner!")]
    IncorrectOwner,
    #[msg("Account is not initialized!")]
    Uninitialized,
    #[msg("Mint Mismatch!")]
    MintMismatch,
    #[msg("Token transfer failed")]
    TokenTransferFailed,
    #[msg("Numerical overflow error")]
    NumericalOverflowError,
    #[msg("Token mint to failed")]
    TokenMintToFailed,
    #[msg("TokenBurnFailed")]
    TokenBurnFailed,
    #[msg("Derived key is invalid")]
    DerivedKeyInvalid,
}
