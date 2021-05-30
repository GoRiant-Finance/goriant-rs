mod error;

use {
    anchor_lang::prelude::*,
    anchor_spl::token::{self, TokenAccount},
    std::convert::Into,
};

use error::ErrorCode;

#[program]
pub mod ico {
    use super::*;

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
        /// Total raised in SOL
        pub raised_amount: u16,
        /// Number of tokens per SOL
        pub rate: u16,
        /// Privileged account.
        pub owner: Pubkey,
        /// Beneficiary account: Account for receiving SOL
        pub beneficiary: Pubkey,
        /// ICO pool token for distribution
        pub ico_pool: Pubkey,
    }

    impl RiantICO {
        pub fn new(ctx: Context<InitializeRiantIco>,
                   state_pub_key: Pubkey,
                   start: i64,
                   cap: u16,
                   rate: u16,
        ) -> Result<Self, ProgramError>
        {
            msg!("Init Riant ICO");
            msg!("Init Riant ICO new program");

            msg!("Transfer 200_000 RIANT from creator to ICO pool vault");
            msg!("Cap {} - Rate {}", cap, rate);
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.clone(),
                token::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.ico_pool.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            );
            let amount = (cap as u64)
                .checked_mul(rate as u64).unwrap()
                .checked_mul(1000000000).unwrap() ;
            if let Ok(()) = token::transfer(cpi_ctx, amount) {} else {
                return Err(ErrorCode::TransferTokenFail.into());
            };

            let riant_ico = Self {
                key: state_pub_key,
                owner: *ctx.accounts.authority.key,
                beneficiary: *ctx.accounts.authority.key,
                initialized: true,
                start,
                cap,
                rate,
                ico_pool: *ctx.accounts.ico_pool.to_account_info().key,
                raised_amount: 0,
            };

            Ok(riant_ico)
        }
    }

    pub fn buy(_ctx: Context<PurchaseRequest>, _amount: u32) -> Result<(), ProgramError> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct PurchaseRequest<'info> {
    #[account(signer)]
    authority: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializeRiantIco<'info> {
    #[account(signer)]
    authority: AccountInfo<'info>,
    #[account(mut)]
    depositor: AccountInfo<'info>,
    #[account(mut)]
    ico_pool: CpiAccount<'info, TokenAccount>,
    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
}