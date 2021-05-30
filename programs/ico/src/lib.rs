use anchor_lang::prelude::*;

#[program]
pub mod ico {
    use super::*;

    /// u16 : MAX 65,536

    #[state]
    pub struct RiantICO {
        /// Address of ICO
        pub key: Pubkey,
        /// Can only be initialized once
        pub initialized: bool,
        /// Start selling time
        pub start: i64,
        /// Capset in SOL
        pub cap: u16,
        /// Number of tokens per SOL
        pub rate: u16,
        /// Initial number of tokens available
        pub initial_tokens: u8,
        /// Privileged account.
        pub owner: Pubkey,
        /// Beneficiary account: Account for receiving SOL
        pub beneficiary: Pubkey,
        /// Token vault for distribution
        pub pool_mint: Pubkey,
        /// Total raised in SOL
        pub raised_amount: u8
    }

    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}