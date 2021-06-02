mod error;

use {
    anchor_lang::prelude::*,
    anchor_spl::token::{self, TokenAccount, Transfer},
    std::convert::Into,
};

use error::ErrorCode;
use crate::ico::RiantICO;

#[program]
pub mod ico {
    use super::*;

    #[state]
    pub struct RiantICO {
        /// Address of ICO
        pub key: Pubkey,
        /// Can only be initialized once
        pub initialized: bool,
        pub imprint: Pubkey,
        pub nonce: u8,
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
        pub ico_pool: Pubkey
    }

    impl RiantICO {
        pub fn new(ctx: Context<InitializeRiantIco>,
                   state_pub_key: Pubkey,
                   nonce: u8,
                   start: i64,
                   cap: u16,
                   rate: u16,
        ) -> Result<Self, ProgramError>
        {
            msg!("Transfer RIANT from depositor to ICO pool");

            let ico_imprint = Pubkey::create_program_address(
                &[
                    state_pub_key.as_ref(),
                    &[nonce],
                ],
                ctx.program_id,
            ).map_err(|_| ErrorCode::InvalidNonce)?;

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
                .checked_mul(1000000000).unwrap();
            if let Ok(()) = token::transfer(cpi_ctx, amount) {} else {
                return Err(ErrorCode::TransferTokenFail.into());
            };

            let riant_ico = Self {
                key: state_pub_key,
                owner: *ctx.accounts.authority.key,
                beneficiary: *ctx.accounts.authority.key,
                initialized: true,
                imprint: ico_imprint,
                nonce,
                start,
                cap,
                rate,
                ico_pool: *ctx.accounts.ico_pool.to_account_info().key,
                raised_amount: 0
            };

            Ok(riant_ico)
        }
    }

    pub fn buy(ctx: Context<PurchaseRequest>,
               amount: u64
    ) -> Result<(), ProgramError> {
        let ico_contract = ctx.accounts.ico_contract.clone();
        let seeds = &[
            ctx.accounts.ico_contract.to_account_info().key.as_ref(),
            &[ico_contract.nonce],
        ];
        let ico_pool_imprint = &[&seeds[..]];
        // msg!("Buyer: {}", ctx.accounts.buyer_sol_wallet.key.clone().to_string());
        // msg!("Transfer {} SOL to Beneficiary: {}", amount, ctx.accounts.beneficiary.key.clone());
        // {
        //     let cpi_ctx = CpiContext::new(
        //         ctx.accounts.system_program.clone(),
        //         Transfer {
        //             from: ctx.accounts.buyer_sol_wallet.to_account_info().clone(),
        //             to: ctx.accounts.beneficiary.to_account_info().clone(),
        //             authority: ctx.accounts.buyer_authority.to_account_info().clone(),
        //         });
        //     token::transfer(cpi_ctx, amount)?;
        // }

        let riant_amount = amount.checked_mul(ico_contract.rate as u64).unwrap();
        msg!("Transfer {} RIANT to Buyer: {}", riant_amount, ctx.accounts.buyer_token_wallet.key.clone());
        {
            let cpi_program = ctx.accounts.token_program.clone();
            let cpi_ctx = CpiContext::new_with_signer(
                cpi_program, Transfer {
                    from: ctx.accounts.ico_pool.to_account_info().clone(),
                    to: ctx.accounts.buyer_token_wallet.to_account_info().clone(),
                    authority: ctx.accounts.ico_imprint.to_account_info().clone(),
                }, ico_pool_imprint);
            token::transfer(cpi_ctx, riant_amount)?;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct PurchaseRequest<'info> {
    #[account(mut)]
    ico_contract: ProgramState<'info, RiantICO>,
    #[account(seeds = [ico_contract.key.as_ref(), & [ico_contract.nonce]])]
    ico_imprint: AccountInfo<'info>,
    #[account(mut)]
    ico_pool: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    beneficiary: AccountInfo<'info>,

    // Client
    #[account(mut)]
    buyer_sol_wallet: AccountInfo<'info>,
    #[account(mut)]
    buyer_token_wallet: AccountInfo<'info>,
    // Misc
    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
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