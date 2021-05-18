const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");

const provider = anchor.Provider.local('https://api.devnet.solana.com');

async function createBalanceSandbox(provider, r, registrySigner) {
  const spt = new anchor.web3.Account();
  const vault = new anchor.web3.Account();
  const vaultStake = new anchor.web3.Account();
  const vaultPendingWithdraw = new anchor.web3.Account();

  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    165
  );

  const createSptIx = await serumCmn.createTokenAccountInstrs(
    provider,
    spt.publicKey,
    r.poolMint,
    registrySigner,
    lamports
  );
  const createVaultIx = await serumCmn.createTokenAccountInstrs(
    provider,
    vault.publicKey,
    r.mint,
    registrySigner,
    lamports
  );
  const createVaultStakeIx = await serumCmn.createTokenAccountInstrs(
    provider,
    vaultStake.publicKey,
    r.mint,
    registrySigner,
    lamports
  );
  const createVaultPwIx = await serumCmn.createTokenAccountInstrs(
    provider,
    vaultPendingWithdraw.publicKey,
    r.mint,
    registrySigner,
    lamports
  );
  let tx0 = new anchor.web3.Transaction();
  tx0.add(
    ...createSptIx,
    ...createVaultIx,
    ...createVaultStakeIx,
    ...createVaultPwIx
  );
  let signers0 = [spt, vault, vaultStake, vaultPendingWithdraw];

  const tx = { tx: tx0, signers: signers0 };

  return [
    tx,
    {
      spt: spt.publicKey,
      vault: vault.publicKey,
      vaultStake: vaultStake.publicKey,
      vaultPendingWithdraw: vaultPendingWithdraw.publicKey,
    },
  ];
}

async function balance(address) {
  return provider.connection.getBalance(address);
}

module.exports = {
  createBalanceSandbox, balance
};
