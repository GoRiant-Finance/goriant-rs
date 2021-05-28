mod error;

/// Simple staking program
/// Created by DianaSensei

use {
    anchor_lang::prelude::*,
    anchor_lang::solana_program::program_option::COption,
    anchor_spl::token::{self, Mint, TokenAccount},
    std::convert::Into,
};

use error::ErrorCode;
use staking::StakingPool;

#[program]
mod staking {
    use super::*;

    #[state]
    pub struct StakingPool {
        /// Address of pool
        pub key: Pubkey,
        /// Privileged account.
        pub authority: Pubkey,
        /// StakingPool imprint
        pub imprint: Pubkey,
        /// Nonce to derive the program-derived address owning the vaults.
        pub nonce: u8,
        /// Number of seconds that must pass for a withdrawal to complete.
        pub withdraw_time_lock: i64,
        /// Mint of the tokens that can be staked.
        pub mint: Pubkey,
        /// Staking pool token mint.
        pub pool_mint: Pubkey,
        pub pool_mint_decimal: u8,
        pub precision_factor: u64,
        /// The amount of tokens (not decimal) that must be staked to get a single
        /// staking pool token.
        pub stake_rate: u64,
        pub reward_vault: Pubkey,

        /// Reward Info
        /// Accrued token per share
        pub acc_token_per_share: u64,
        /// The block number when RIANT mining ends.
        pub bonus_end_block: i64,
        /// The block number when RIANT mining starts.
        pub start_block: i64,
        /// The block number of the last pool update
        pub last_reward_block: i64,
        /// RIANT tokens created per block.
        pub reward_per_block: u64,
    }

    impl StakingPool {
        #[access_control(InitializeStakingPoolRequest::validate(& ctx, state_pub_key, staking_pool_nonce))]
        pub fn new(ctx: Context<InitializeStakingPoolRequest>,
                   mint: Pubkey,
                   state_pub_key: Pubkey,
                   staking_pool_nonce: u8,
                   stake_rate: u64,
                   withdraw_time_lock: i64,
                   start_block: i64,
                   reward_per_block: u64,
                   bonus_end_block: i64,
        ) -> Result<Self, ProgramError>
        {
            let staking_pool_imprint = Pubkey::create_program_address(
                &[
                    state_pub_key.as_ref(),
                    &[staking_pool_nonce],
                ],
                ctx.program_id,
            ).map_err(|_| ErrorCode::InvalidNonce)?;

            if ctx.accounts.pool_mint.decimals >= 10 {
                return Err(ErrorCode::CalculateError.into());
            }

            let precision_factor = u64::pow(10, ctx.accounts.pool_mint.decimals as u32);

            if bonus_end_block < start_block {
                return Err(ErrorCode::InvalidExpiry.into());
            }

            let reward_unit;
            if reward_per_block > 0 && bonus_end_block > start_block {
                let total_time = bonus_end_block.checked_sub(start_block).unwrap() as u64;
                let total_reward = reward_per_block.checked_mul(total_time).unwrap();

                {
                    msg!("Transfer token from depositor to reward vault");
                    let cpi_ctx = CpiContext::new(
                        ctx.accounts.token_program.clone(),
                        token::Transfer {
                            from: ctx.accounts.reward_deposit.to_account_info(),
                            to: ctx.accounts.reward_vault.to_account_info(),
                            authority: ctx.accounts.reward_authority.to_account_info(),
                        },
                    );
                    if let Ok(()) = token::transfer(cpi_ctx, total_reward) {} else {
                        return Err(ErrorCode::TransferTokenFail.into());
                    };
                }

                reward_unit = reward_per_block;
            } else {
                reward_unit = 0;
            }

            let staking_pool = Self {
                key: state_pub_key,
                authority: *ctx.accounts.authority.key,
                imprint: staking_pool_imprint,
                nonce: staking_pool_nonce,
                withdraw_time_lock,
                mint,
                stake_rate,
                pool_mint: *ctx.accounts.pool_mint.to_account_info().key,
                acc_token_per_share: 0,
                bonus_end_block,
                start_block,
                last_reward_block: start_block,
                reward_per_block: reward_unit,
                pool_mint_decimal: ctx.accounts.pool_mint.decimals,
                precision_factor,
                reward_vault: *ctx.accounts.reward_vault.to_account_info().key,
            };

            Ok(staking_pool)
        }

        pub fn update_start_and_end_blocks(&mut self, ctx: Context<UpdateBlockRequest>, start_block: i64, end_block: i64) -> Result<(), ProgramError>
        {
            if ctx.accounts.clock.unix_timestamp < self.start_block {
                msg!("Pool has started");
                return Err(ErrorCode::InvalidExpiry.into());
            }
            if start_block < end_block {
                msg!("New startBlock must be lower than new endBlock");
                return Err(ErrorCode::InvalidExpiry.into());
            }
            if ctx.accounts.clock.unix_timestamp < start_block {
                msg!("New startBlock must be higher than current block");
                return Err(ErrorCode::InvalidExpiry.into());
            }
            self.start_block = start_block;
            self.bonus_end_block = end_block;
            self.last_reward_block = start_block;
            Ok(())
        }

        pub fn update_reward_per_block(&mut self, ctx: Context<UpdateBlockRequest>, reward_per_block: u64) -> Result<(), ProgramError>
        {
            if ctx.accounts.clock.unix_timestamp < self.start_block {
                msg!("Pool has started");
                return Err(ErrorCode::InvalidExpiry.into());
            }
            self.reward_per_block = reward_per_block;
            Ok(())
        }

        pub fn stop_reward(&mut self, ctx: Context<UpdateBlockRequest>) -> Result<(), ProgramError>
        {
            self.bonus_end_block = ctx.accounts.clock.unix_timestamp;
            Ok(())
        }
    }

    pub fn create_member(ctx: Context<CreateMemberRequest>, member_nonce: u8) -> Result<(), ProgramError>
    {
        msg!("Create member");
        let member = &mut ctx.accounts.member;
        member.authority = *ctx.accounts.authority.key;
        member.balances = (&ctx.accounts.balances).into();
        member.nonce = member_nonce;
        member.reward_debt = 0;

        Ok(())
    }

    pub fn deposit(ctx: Context<DepositRequest>, amount: u64) -> Result<(), ProgramError>
    {
        if amount < 0 {
            return Err(ErrorCode::InvalidDepositor.into());
        }
        let state = &mut ctx.accounts.staking_pool;
        update_pool(state, ctx.accounts.clock.clone(), ctx.accounts.pool_mint.supply).unwrap();
        let member = &mut ctx.accounts.member;
        if ctx.accounts.balances.spt.amount > 0 {
            let pending_reward = (ctx.accounts.balances.spt.amount as u128)
                .checked_mul(state.acc_token_per_share as u128).unwrap()
                .checked_div(state.precision_factor as u128).unwrap()
                .checked_sub(member.reward_debt as u128).unwrap() as u64;
            msg!("Pending reward: {}", pending_reward);
            // Deposit from depositor account to stake vault
            if pending_reward > 0
            {
                msg!("Transfer pending reward from reward to pending vault");
                let seeds = &[
                    state.to_account_info().key.as_ref(),
                    &[state.nonce],
                ];
                let staking_pool_imprint = &[&seeds[..]];

                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.clone(),
                    token::Transfer {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        to: ctx.accounts.balances.vault_pw.to_account_info(),
                        authority: ctx.accounts.imprint.to_account_info(),
                    },
                    staking_pool_imprint,
                );
                if let Ok(()) = token::transfer(cpi_ctx, pending_reward) {} else {
                    return Err(ErrorCode::TransferTokenFail.into());
                };
            }
        }

        // Deposit from depositor account to stake vault

        msg!("Transfer token from depositor to stake vault");
        let seeds = &[
            state.to_account_info().key.as_ref(),
            member.to_account_info().key.as_ref(),
            &[member.nonce],
        ];
        let member_imprint = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.clone(),
            token::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.balances.vault_stake.to_account_info(),
                authority: ctx.accounts.depositor_authority.to_account_info(),
            },
            member_imprint,
        );

        if let Ok(()) = token::transfer(cpi_ctx, amount) {} else {
            return Err(ErrorCode::TransferTokenFail.into());
        };


        // Mint pool tokens to the staker - staking pool token.

        msg!("Mint proof token to staker vault");
        let seeds = &[
            state.to_account_info().key.as_ref(),
            &[state.nonce],
        ];
        let staking_pool_imprint = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.clone(),
            token::MintTo {
                mint: ctx.accounts.pool_mint.to_account_info(),
                to: ctx.accounts.balances.spt.to_account_info(),
                authority: ctx.accounts.imprint.to_account_info(),
            },
            staking_pool_imprint,
        );
        let spt_amount = amount
            .checked_div(state.stake_rate)
            .unwrap();
        if let Ok(()) = token::mint_to(cpi_ctx, spt_amount) {} else {
            return Err(ErrorCode::MintProveTokenFail.into());
        };

        let spt = ctx.accounts.balances.spt.reload().unwrap().amount;

        member.reward_debt = (spt as u128)
            .checked_mul(state.acc_token_per_share as u128).unwrap()
            .checked_div(state.precision_factor as u128).unwrap() as u64;

        Ok(())
    }

    pub fn withdraw(ctx: Context<WithDrawRequest>, amount: u64) -> Result<(), ProgramError>
    {
        if amount > ctx.accounts.balances.vault_stake.amount {
            return Err(ErrorCode::InsufficientWithdraw.into());
        }
        // Safe calculate
        let spt_amount = amount.checked_div(ctx.accounts.staking_pool.stake_rate);
        if spt_amount.is_none() {
            return Err(ErrorCode::CalculateError.into());
        }

        // Check the vaults given are correct.
        if *ctx.accounts.balances.vault_stake.to_account_info().key != ctx.accounts.member.balances.vault_stake {
            return Err(ErrorCode::InvalidVault.into());
        }
        if *ctx.accounts.balances.vault_pw.to_account_info().key != ctx.accounts.member.balances.vault_pw {
            return Err(ErrorCode::InvalidVault.into());
        }

        let state = &mut ctx.accounts.staking_pool;
        update_pool(state, ctx.accounts.clock.clone(), ctx.accounts.pool_mint.supply).unwrap();
        msg!("Accumulate token per share: {}", state.acc_token_per_share);

        let pending_reward = (ctx.accounts.balances.spt.amount as u128)
            .checked_mul(state.acc_token_per_share as u128).unwrap()
            .checked_div(state.precision_factor as u128).unwrap()
            .checked_sub(ctx.accounts.member.reward_debt as u128).unwrap() as u64;
        msg!("pending reward: {}", pending_reward);

        let spt_amount = spt_amount.unwrap();

        let seeds = &[
            state.to_account_info().key.as_ref(),
            ctx.accounts.member.to_account_info().key.as_ref(),
            &[ctx.accounts.member.nonce],
        ];
        let member_imprint = &[&seeds[..]];
        if amount > 0
        {
            // Burn staking pool token
            {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.clone(),
                    token::Burn {
                        mint: ctx.accounts.pool_mint.to_account_info(),
                        to: ctx.accounts.balances.spt.to_account_info(),
                        authority: ctx.accounts.member_imprint.to_account_info(),
                    },
                    member_imprint,
                );
                if let Ok(()) = token::burn(cpi_ctx, spt_amount) {} else {
                    return Err(ErrorCode::BurnStakingTokenFail.into());
                }
            }

            // Transfer token from stake vault to token account
            {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.clone(),
                    token::Transfer {
                        from: ctx.accounts.balances.vault_stake.to_account_info(),
                        to: ctx.accounts.beneficial.to_account_info(),
                        authority: ctx.accounts.member_imprint.clone(),
                    },
                    member_imprint);

                if let Ok(()) = token::transfer(cpi_ctx, amount) {} else {
                    return Err(ErrorCode::TransferTokenFail.into());
                }
            }
        }

        // Deposit from depositor account to stake vault
        if pending_reward > 0
        {
            msg!("Transfer pending reward to vault pending");
            let seeds = &[
                state.to_account_info().key.as_ref(),
                &[state.nonce],
            ];
            let staking_pool_imprint = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.clone(),
                token::Transfer {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.balances.vault_pw.to_account_info(),
                    authority: ctx.accounts.imprint.to_account_info(),
                },
                staking_pool_imprint,
            );
            if let Ok(()) = token::transfer(cpi_ctx, pending_reward) {} else {
                return Err(ErrorCode::TransferTokenFail.into());
            };
        }

        let spt = ctx.accounts.balances.spt.reload().unwrap().amount;

        let member = &mut ctx.accounts.member;
        member.reward_debt = (spt as u128)
            .checked_mul(state.acc_token_per_share as u128).unwrap()
            .checked_div(state.precision_factor as u128).unwrap() as u64;

        Ok(())
    }

    pub fn cal_pending_reward(ctx: Context<CheckPendingRewardRequest>) -> Result<(), ProgramError>
    {
        let staked_token_supply = ctx.accounts.balances.spt.amount;
        let member_reward_debt = ctx.accounts.member.reward_debt;
        let state = ctx.accounts.staking_pool.clone();
        let amount = ctx.accounts.balances.spt.amount.clone();
        let pending_reward = if ctx.accounts.clock.unix_timestamp > state.last_reward_block && staked_token_supply != 0 {
            let multiplier = get_multiplier(state.last_reward_block, ctx.accounts.clock.unix_timestamp, state.bonus_end_block);
            let cake_reward = multiplier.checked_mul(state.reward_per_block).unwrap();
            let adjusted_token_per_share = state.acc_token_per_share as u128 + (cake_reward as u128)
                .checked_mul(state.precision_factor as u128).unwrap()
                .checked_div(staked_token_supply as u128).unwrap();
            amount as u128 * adjusted_token_per_share / state.precision_factor as u128 - member_reward_debt as u128
        } else {
            amount as u128 * state.acc_token_per_share as u128 / state.precision_factor as u128 - member_reward_debt as u128
        };
        msg!("Pending reward: {}", pending_reward);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeStakingPoolRequest<'info> {
    #[account(signer)]
    authority: AccountInfo<'info>,
    #[account()]
    pool_mint: CpiAccount<'info, Mint>,
    #[account(mut)]
    reward_vault: CpiAccount<'info, TokenAccount>,

    #[account(mut)]
    reward_deposit: AccountInfo<'info>,
    #[account(signer)]
    reward_authority: AccountInfo<'info>,

    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
}

impl<'info> InitializeStakingPoolRequest<'info> {
    fn validate(ctx: &Context<InitializeStakingPoolRequest<'info>>, state_pub_key: Pubkey, staking_pool_nonce: u8) -> Result<(), ProgramError> {
        let staking_pool_imprint = Pubkey::create_program_address(
            &[
                state_pub_key.as_ref(),
                &[staking_pool_nonce],
            ],
            ctx.program_id,
        ).map_err(|_| ErrorCode::InvalidNonce)?;
        if ctx.accounts.pool_mint.mint_authority != COption::Some(staking_pool_imprint) {
            return Err(ErrorCode::InvalidPoolMintAuthority.into());
        }

        assert_eq!(ctx.accounts.pool_mint.supply, 0);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMemberRequest<'info> {
    staking_pool: ProgramState<'info, StakingPool>,

    /// Member relate account
    #[account(associated = authority, space = "264")]
    member: ProgramAccount<'info, Member>,
    #[account(mut, signer)]
    authority: AccountInfo<'info>,
    #[account(
    "&balances.spt.owner == member_imprint.key",
    "balances.spt.mint == staking_pool.pool_mint",
    "balances.vault_stake.mint == staking_pool.mint",
    "balances.vault_pw.mint == staking_pool.mint"
    )]
    balances: BalanceSandboxAccounts<'info>,
    member_imprint: AccountInfo<'info>,

    // Misc.
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DepositRequest<'info> {
    #[account(mut)]
    staking_pool: ProgramState<'info, StakingPool>,
    #[account(mut)]
    pool_mint: CpiAccount<'info, Mint>,
    #[account(seeds = [staking_pool.key.as_ref(), & [staking_pool.nonce]])]
    imprint: AccountInfo<'info>,
    #[account(mut)]
    reward_vault: CpiAccount<'info, TokenAccount>,

    /// Member relate account
    #[account(mut, has_one = authority)]
    member: ProgramAccount<'info, Member>,
    #[account(mut, signer)]
    authority: AccountInfo<'info>,
    #[account(
    "&balances.spt.owner == member_imprint.key",
    "balances.spt.mint == staking_pool.pool_mint",
    "balances.vault_stake.mint == staking_pool.mint",
    "balances.vault_pw.mint == staking_pool.mint"
    )]
    balances: BalanceSandboxAccounts<'info>,
    #[account(seeds = [
    staking_pool.to_account_info().key.as_ref(),
    member.to_account_info().key.as_ref(),
    & [member.nonce]
    ]
    )]
    member_imprint: AccountInfo<'info>,

    /// Depositor
    #[account(mut)]
    depositor: AccountInfo<'info>,
    #[account(signer, "depositor_authority.key == &member.authority")]
    depositor_authority: AccountInfo<'info>,

    // Misc.
    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithDrawRequest<'info> {
    #[account(mut)]
    staking_pool: ProgramState<'info, StakingPool>,
    #[account(seeds = [staking_pool.key.as_ref(), & [staking_pool.nonce]])]
    imprint: AccountInfo<'info>,
    #[account(mut)]
    pool_mint: CpiAccount<'info, Mint>,
    #[account(mut)]
    reward_vault: CpiAccount<'info, TokenAccount>,

    /// Member relate account
    #[account(mut, has_one = authority)]
    member: ProgramAccount<'info, Member>,
    #[account(mut, signer)]
    authority: AccountInfo<'info>,
    #[account(
    "&balances.spt.owner == member_imprint.key",
    "balances.spt.mint == staking_pool.pool_mint",
    "balances.vault_stake.mint == staking_pool.mint",
    "balances.vault_pw.mint == staking_pool.mint"
    )]
    balances: BalanceSandboxAccounts<'info>,
    #[account(seeds = [
    staking_pool.to_account_info().key.as_ref(),
    member.to_account_info().key.as_ref(),
    & [member.nonce]
    ]
    )]
    member_imprint: AccountInfo<'info>,

    /// claim to
    #[account(mut)]
    beneficial: AccountInfo<'info>,
    #[account(signer, "beneficial_authority.key == &member.authority")]
    beneficial_authority: AccountInfo<'info>,

    // Misc.
    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CheckPendingRewardRequest<'info> {
    staking_pool: ProgramState<'info, StakingPool>,
    pool_mint: CpiAccount<'info, Mint>,

    /// Member relate account
    #[account(has_one = authority)]
    member: ProgramAccount<'info, Member>,
    #[account(mut, signer)]
    authority: AccountInfo<'info>,
    #[account(
    "balances.spt.mint == staking_pool.pool_mint",
    "balances.vault_stake.mint == staking_pool.mint",
    "balances.vault_pw.mint == staking_pool.mint"
    )]
    balances: BalanceSandboxAccounts<'info>,
    clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct UpdateBlockRequest<'info> {
    clock: Sysvar<'info, Clock>,
}

#[associated]
pub struct Member {
    /// The effective owner of the Member account.
    pub authority: Pubkey,
    /// Arbitrary metadata account owned by any program.
    pub metadata: Pubkey,
    /// Sets of balances owned by the Member.
    pub balances: BalanceSandbox,
    ///
    pub reward_debt: u64,
    /// Signer nonce.
    pub nonce: u8,
}

/// BalanceSandbox defines isolated funds that can only be deposited/withdrawn
/// into the program.
///
/// Once controlled by the program, the associated `Member` account's beneficiary
/// can send funds to/from any of the accounts within the sandbox, e.g., to
/// stake.
#[derive(AnchorSerialize, AnchorDeserialize, Default, Debug, Clone, PartialEq)]
pub struct BalanceSandbox {
    // Staking pool token.
    pub spt: Pubkey,
    // Stake vaults.
    pub vault_stake: Pubkey,
    // Pending withdrawal vaults.
    pub vault_pw: Pubkey,
}

/// When creating a member, the mints and owners of these accounts are correct.
/// Upon creation, we assign the accounts. A onetime operation.
/// When using a member, we check these accounts addresess are equal to the
/// addresses stored on the member. If so, the correct accounts were given are
/// correct.
#[derive(Accounts, Clone)]
pub struct BalanceSandboxAccounts<'info> {
    #[account(mut)]
    spt: CpiAccount<'info, TokenAccount>,
    #[account(mut, "vault_stake.owner == spt.owner")]
    vault_stake: CpiAccount<'info, TokenAccount>,
    #[account(mut, "vault_pw.owner == spt.owner", "vault_pw.mint == vault_stake.mint")]
    vault_pw: CpiAccount<'info, TokenAccount>,
}

impl<'info> From<&BalanceSandboxAccounts<'info>> for BalanceSandbox {
    fn from(accounts: &BalanceSandboxAccounts<'info>) -> Self {
        Self {
            spt: *accounts.spt.to_account_info().key,
            vault_stake: *accounts.vault_stake.to_account_info().key,
            vault_pw: *accounts.vault_pw.to_account_info().key,
        }
    }
}

pub fn update_pool<'info>(state: &mut ProgramState<'info, StakingPool>, clock: Sysvar<'info, Clock>, total_staked: u64) -> Result<(), ProgramError> {
    msg!("current timestamp: {} - last_reward_block: {}", clock.unix_timestamp, state.last_reward_block);
    if clock.unix_timestamp <= state.last_reward_block {
        msg!("Undue time stamp to start reward");
        return Ok(());
    }
    let staked_token_supply = total_staked;
    if staked_token_supply == 0 {
        state.last_reward_block = clock.unix_timestamp.clone();
        return Ok(());
    }
    let precision_factor = state.precision_factor;
    let multiplier = get_multiplier(state.last_reward_block, clock.unix_timestamp, state.bonus_end_block.clone());
    let token_reward = multiplier.checked_mul(state.reward_per_block).unwrap() as u128;
    let next_acc_token_per_share =
        token_reward
            .checked_mul(precision_factor as u128).unwrap()
            .checked_div(staked_token_supply as u128).unwrap_or(0) as u64;
    state.acc_token_per_share = state.acc_token_per_share.checked_add(next_acc_token_per_share).unwrap();
    state.last_reward_block = clock.unix_timestamp;
    msg!("Acc token per share: {}", state.acc_token_per_share);
    Ok(())
}

pub fn get_multiplier(from: i64, to: i64, bonus_end_block: i64) -> u64 {
    return if to <= bonus_end_block {
        to - from
    } else if from >= bonus_end_block {
        0
    } else {
        bonus_end_block - from
    } as u64;
}