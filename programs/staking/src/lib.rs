mod error;

/// Simple staking program
/// Created by DianaSensei

use {
    anchor_lang::prelude::*,
    anchor_lang::solana_program::program_option::COption,
    anchor_spl::token::{self, Mint, TokenAccount, Transfer},
    std::convert::Into
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
        /// Global event queue for reward vendoring.
        pub reward_event_q: Pubkey,
        /// Mint of the tokens that can be staked.
        pub mint: Pubkey,
        /// Staking pool token mint.
        pub pool_mint: Pubkey,
        /// Vendor of pool
        pub vendor: Pubkey,
        /// The amount of tokens (not decimal) that must be staked to get a single
        /// staking pool token.
        pub stake_rate: u64
    }
    impl StakingPool {
        #[access_control(InitializeStakingPoolRequest::validate(&ctx, state_pub_key, staking_pool_nonce, vendor_nonce, mint))]
        pub fn new(
            ctx: Context<InitializeStakingPoolRequest>,
            mint: Pubkey,
            state_pub_key: Pubkey,
            vendor_pub_key: Pubkey,
            staking_pool_nonce: u8,
            vendor_nonce: u8,
            stake_rate: u64,
            withdraw_time_lock: i64,
        ) -> Result<Self, ProgramError>
        {
            let staking_pool_imprint = Pubkey::create_program_address(
                &[
                    state_pub_key.as_ref(),
                    &[staking_pool_nonce],
                ],
                ctx.program_id,
            ).map_err(|_| ErrorCode::InvalidNonce)?;

            let vendor = &mut ctx.accounts.vendor;
            vendor.activated = false;
            vendor.vault = *ctx.accounts.vendor_vault.to_account_info().key;
            vendor.mint = ctx.accounts.vendor_vault.mint;
            vendor.nonce = vendor_nonce;
            // vendor.pool_token_supply = ctx.accounts.pool_mint.supply;
            // vendor.position_in_reward_queue = reward_position;
            // vendor.start_ts = ctx.accounts.clock.unix_timestamp;
            // vendor.expiry_ts = expiry_ts;
            // vendor.expiry_receiver = expiry_receiver;
            // vendor.from = *ctx.accounts.depositor_authority.key;
            // vendor.total = amount;


            let staking_pool = Self {
                key: state_pub_key,
                authority: *ctx.accounts.authority.key,
                imprint: staking_pool_imprint,
                nonce: staking_pool_nonce,
                withdraw_time_lock,
                reward_event_q: *ctx.accounts.reward_event_q.to_account_info().key,
                mint,
                pool_mint: *ctx.accounts.pool_mint.to_account_info().key,
                vendor: vendor_pub_key,
                stake_rate
            };


            msg!("Initialize Staking pool");
            Ok(staking_pool)
        }
    }


    pub fn create_member(ctx: Context<CreateMemberRequest>, member_nonce: u8) -> Result<(), ProgramError>
    {
        msg!("Create member");
        let member = &mut ctx.accounts.member;
        member.authority = *ctx.accounts.authority.key;
        member.balances = (&ctx.accounts.balances).into();
        member.nonce = member_nonce;

        Ok(())
    }

    #[access_control(StakeRequest::validate(&ctx))]
    pub fn deposit_and_state(ctx: Context<StakeRequest>, amount: u64) -> Result<(), ProgramError>
    {
        // Deposit from depositor account to stake vault
        {
            msg!("Transfer token from depositor to stake vault");
            let seeds = &[
                ctx.accounts.staking_pool.to_account_info().key.as_ref(),
                ctx.accounts.member.to_account_info().key.as_ref(),
                &[ctx.accounts.member.nonce],
            ];
            let member_imprint = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.clone(),
                Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.balances.vault_stake.to_account_info(),
                    authority: ctx.accounts.depositor_authority.to_account_info(),
                },
                member_imprint
            );
            // // Convert from stake-token units to mint-token units.
            // let token_amount = amount
            //     .checked_mul(ctx.accounts.staking_pool.stake_rate)
            //     .unwrap();
            if let Ok(()) = token::transfer(cpi_ctx, amount) {}
            else{
                return Err(ErrorCode::TransferDepositFail.into())
            };
        }

        // Mint pool tokens to the staker - staking pool token.
        {
            msg!("Mint proof token to staker vault");
            let seeds = &[
                ctx.accounts.staking_pool.to_account_info().key.as_ref(),
                &[ctx.accounts.staking_pool.nonce],
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
                .checked_div(ctx.accounts.staking_pool.stake_rate)
                .unwrap();
            if let Ok(()) = token::mint_to(cpi_ctx, spt_amount){}
            else {
                return Err(ErrorCode::MintProveTokenFail.into())
            };
        }

        msg!("Update last stake time");
        // Update stake timestamp.
        let member = &mut ctx.accounts.member;
        member.last_stake_ts = ctx.accounts.clock.unix_timestamp;

        Ok(())
    }

    #[access_control(DropRewardRequest::validate(&ctx))]
    pub fn drop_reward(ctx: Context<DropRewardRequest>, amount: u64) -> Result<(), ProgramError>
    {
        // Transfer funds into the vendor's vault.
        {
            msg!("Transfer token from depositor to stake vault");
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.clone(),
                Transfer {
                    from: ctx.accounts.depositor.clone(),
                    to: ctx.accounts.vendor_vault.to_account_info(),
                    authority: ctx.accounts.depositor_authority.clone(),
                }
            );
            if let Ok(()) = token::transfer(cpi_ctx, amount) {}
            else{
                return Err(ErrorCode::TransferDepositFail.into())
            };
        }

        // {
        //     // Add the event to the reward queue.
        //     let reward_queue = &mut ctx.accounts.reward_event_queue;
        //     let reward_position = reward_queue.append(RewardEvent {
        //         vendor: *ctx.accounts.vendor.to_account_info().key,
        //         ts: ctx.accounts.clock.unix_timestamp
        //     })?;
        //
        // }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeStakingPoolRequest<'info> {
    #[account(signer)]
    authority: AccountInfo<'info>,
    #[account(init)]
    vendor: ProgramAccount<'info, RewardVendor>,
    #[account(mut)]
    vendor_vault: CpiAccount<'info, TokenAccount>,
    #[account(init)]
    reward_event_q: ProgramAccount<'info, RewardQueue>,
    #[account("pool_mint.decimals == 0")]
    pool_mint: CpiAccount<'info, Mint>,
    rent: Sysvar<'info, Rent>
}
impl<'info> InitializeStakingPoolRequest<'info> {
    fn validate(ctx: &Context<InitializeStakingPoolRequest<'info>>, state_pub_key: Pubkey, staking_pool_nonce: u8, vendor_nonce: u8, mint: Pubkey) -> Result<(), ProgramError> {
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

        let vendor_imprint = Pubkey::create_program_address(
            &[
                state_pub_key.as_ref(),
                ctx.accounts.vendor.to_account_info().key.as_ref(),
                &[vendor_nonce],
            ],
            ctx.program_id,
        ).map_err(|_| ErrorCode::InvalidNonce)?;
        if ctx.accounts.vendor_vault.owner != vendor_imprint {
            return Err(ErrorCode::InvalidVaultOwner.into());
        }

        if ctx.accounts.vendor_vault.mint != mint {
            return Err(ErrorCode::MintNotMatch.into())
        }

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
pub struct StakeRequest<'info> {
    staking_pool: ProgramState<'info, StakingPool>,
    #[account(mut)]
    pool_mint: CpiAccount<'info, Mint>,
    #[account(seeds = [staking_pool.key.as_ref(), &[staking_pool.nonce]])]
    imprint: AccountInfo<'info>,

    /// Member relate account
    #[account(has_one = authority)]
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

    /// Depositor
    #[account(mut)]
    depositor: AccountInfo<'info>,
    #[account(signer, "depositor_authority.key == &member.authority")]
    depositor_authority: AccountInfo<'info>,


    // Misc.
    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
    rent: Sysvar<'info, Rent>
}
impl<'info> StakeRequest<'info> {
    fn validate(ctx: &Context<StakeRequest<'info>>) -> Result<(), ProgramError> {
        let staking_pool_imprint = Pubkey::create_program_address(
            &[
                ctx.accounts.staking_pool.key.as_ref(),
                &[ctx.accounts.staking_pool.nonce],
            ],
            ctx.program_id,
        )
            .map_err(|_| ErrorCode::InvalidNonce)?;

        if ctx.accounts.pool_mint.mint_authority != COption::Some(staking_pool_imprint) {
            return Err(ErrorCode::InvalidPoolMintAuthority.into());
        }
        msg!("Validate success");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct DropRewardRequest<'info> {
    // Staking instance.
    #[account(mut)]
    reward_event_queue: ProgramAccount<'info, RewardQueue>,

    // Vendor.
    #[account(mut)]
    vendor: ProgramAccount<'info, RewardVendor>,
    #[account(mut)]
    vendor_vault: CpiAccount<'info, TokenAccount>,

    // Depositor.
    #[account(mut)]
    depositor: AccountInfo<'info>,
    #[account(signer)]
    depositor_authority: AccountInfo<'info>,

    // Misc.
    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
    rent: Sysvar<'info, Rent>,
}
impl<'info> DropRewardRequest<'info> {
    fn validate(_ctx: &Context<DropRewardRequest<'info>>) -> Result<(), ProgramError> {
        // let staking_pool_imprint = Pubkey::create_program_address(
        //     &[
        //         ctx.accounts.staking_pool.key.as_ref(),
        //         &[ctx.accounts.staking_pool.nonce],
        //     ],
        //     ctx.program_id,
        // )
        //     .map_err(|_| ErrorCode::InvalidNonce)?;
        //
        // if ctx.accounts.pool_mint.mint_authority != COption::Some(staking_pool_imprint) {
        //     return Err(ErrorCode::InvalidPoolMintAuthority.into());
        // }
        msg!("Validate success");
        Ok(())
    }
}

#[account]
pub struct RewardVendor {
    pub vault: Pubkey,
    pub mint: Pubkey,
    pub nonce: u8,
    pub pool_token_supply: u64,
    pub position_in_reward_queue: u32,
    pub start_ts: i64,
    pub expiry_ts: i64,
    pub expiry_receiver: Pubkey,
    pub from: Pubkey,
    pub total: u64,
    pub expired: bool,
    pub activated: bool,
}

#[associated]
pub struct Member {
    /// The effective owner of the Member account.
    pub authority: Pubkey,
    /// Arbitrary metadata account owned by any program.
    pub metadata: Pubkey,
    /// Sets of balances owned by the Member.
    pub balances: BalanceSandbox,
    /// Next position in the rewards event queue to process.
    pub rewards_cursor: u32,
    /// The clock timestamp of the last time this account staked or switched
    /// entities. Used as a proof to reward vendors that the Member account
    /// was staked at a given point in time.
    pub last_stake_ts: i64,
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
    pub vault_pw: Pubkey
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Debug, Clone, PartialEq)]
pub struct RewardPolicy {
    start_drop_ts: i64,
    end_drop_ts: i64,
    interval: i64,
    is_allow_claim_mid_stake: bool
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

#[account]
pub struct RewardQueue {
    // Invariant: index is position of the next available slot.
    head: u32,
    // Invariant: index is position of the first (oldest) taken slot.
    // Invariant: head == tail => queue is initialized.
    // Invariant: index_of(head + 1) == index_of(tail) => queue is full.
    tail: u32,
    // Although a vec is used, the size is immutable.
    events: Vec<RewardEvent>,
}
impl RewardQueue {
    pub fn append(&mut self, event: RewardEvent) -> Result<u32, ProgramError> {
        let cursor = self.head;

        // Insert into next available slot.
        let h_idx = self.index_of(self.head);
        self.events[h_idx] = event;

        // Update head and tail counters.
        let is_full = self.index_of(self.head + 1) == self.index_of(self.tail);
        if is_full {
            self.tail += 1;
        }
        self.head += 1;

        Ok(cursor)
    }

    pub fn index_of(&self, counter: u32) -> usize {
        counter as usize % self.capacity()
    }

    pub fn capacity(&self) -> usize {
        self.events.len()
    }

    pub fn get(&self, cursor: u32) -> &RewardEvent {
        &self.events[cursor as usize % self.capacity()]
    }

    pub fn head(&self) -> u32 {
        self.head
    }

    pub fn tail(&self) -> u32 {
        self.tail
    }
}

#[derive(Default, Clone, Copy, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct RewardEvent {
    vendor: Pubkey,
    ts: i64
}

