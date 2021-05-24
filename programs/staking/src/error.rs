
use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
    #[msg("The given reward queue has already been initialized.")]
    RewardQAlreadyInitialized,
    #[msg("The nonce given doesn't derive a valid program address.")]
    InvalidNonce,
    #[msg("Invalid pool mint authority")]
    InvalidPoolMintAuthority,
    #[msg("Member signer doesn't match the derived address.")]
    InvalidMemberSigner,
    #[msg("The given vault owner must match the signing depositor.")]
    InvalidVaultDeposit,
    #[msg("The signing depositor doesn't match either of the balance accounts")]
    InvalidDepositor,
    #[msg("The vault given does not match the vault expected.")]
    InvalidVault,
    #[msg("Invalid vault owner.")]
    InvalidVaultOwner,
    #[msg("An unknown error has occured.")]
    Unknown,
    #[msg("The unstake timelock has not yet expired.")]
    UnstakeTimelock,
    #[msg("Reward vendors must have at least one token unit per pool token")]
    InsufficientReward,
    #[msg("Reward expiry must be after the current clock timestamp.")]
    InvalidExpiry,
    #[msg("The reward vendor has been expired.")]
    VendorExpired,
    #[msg("This reward has already been processed.")]
    CursorAlreadyProcessed,
    #[msg("The account was not staked at the time of this reward.")]
    NotStakedDuringDrop,
    #[msg("The vendor is not yet eligible for expiry.")]
    VendorNotYetExpired,
    #[msg("Please collect your reward before otherwise using the program.")]
    RewardsNeedsProcessing,
    #[msg("Locked reward vendor expected but an unlocked vendor was given.")]
    ExpectedLockedVendor,
    #[msg("Unlocked reward vendor expected but a locked vendor was given.")]
    ExpectedUnlockedVendor,
    #[msg("Locked deposit from an invalid deposit authority.")]
    InvalidVestingSigner,
    #[msg("Locked rewards cannot be realized until one unstaked all tokens.")]
    UnrealizedReward,
    #[msg("The beneficiary doesn't match.")]
    InvalidBeneficiary,
    #[msg("The given member account does not match the realizor metadata.")]
    InvalidRealizorMetadata,
    #[msg("Invalid vesting schedule for the locked reward.")]
    InvalidVestingSchedule,
    #[msg("Please specify the correct authority for this program.")]
    InvalidProgramAuthority,
    #[msg("Transfer deposit fail")]
    TransferDepositFail,
    #[msg("Mint prove token fail")]
    MintProveTokenFail,
    #[msg("Mint not match")]
    MintNotMatch
}
