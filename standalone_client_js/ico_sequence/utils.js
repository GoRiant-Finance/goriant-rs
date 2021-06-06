const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const fs = require('fs');


// const provider = anchor.Provider.local('http://localhost:8899');
const provider = anchor.Provider.local('https://api.devnet.solana.com');

async function log_state(state) {
  console.log("state.key: ", state.key.toString());
  console.log("state.authority: ", state.authority.toString());
  console.log("state.imprint: ", state.imprint.toString());
  console.log("state.nonce: ", state.nonce.toString())
  console.log("state.withdrawTimeLock: ", state.withdrawTimeLock.toString())
  console.log("state.mint: ", state.mint.toString())
  console.log("state.poolMint: ", state.poolMint.toString())
  console.log("state.poolMintDecimal", state.poolMintDecimal.toString())
  console.log("state.precisionFactor: ", state.precisionFactor.toString())
  console.log("state.stakeRate: ", state.stakeRate.toString())
  console.log("state.accTokenPerShare: ", state.accTokenPerShare.toString())
  console.log("state.startBlock: ", state.startBlock.toString())
  console.log("state.bonusEndBlock: ", state.bonusEndBlock.toString())
  console.log("state.lastRewardBlock: ", state.lastRewardBlock.toString())
  console.log("state.rewardPerBlock: ", state.rewardPerBlock.toString())
  console.log("state.rewardVault: ", state.rewardVault.toString(), " - amount: ", await tokenBalance(state.rewardVault))
}
async function createBalanceSandbox(provider, r, registrySigner) {
  const spt = new anchor.web3.Account();
  const vaultStake = new anchor.web3.Account();
  const vaultPw = new anchor.web3.Account();

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
  const createVaultStakeIx = await serumCmn.createTokenAccountInstrs(
    provider,
    vaultStake.publicKey,
    r.mint,
    registrySigner,
    lamports
  );
  const createVaultPwIx = await serumCmn.createTokenAccountInstrs(
    provider,
      vaultPw.publicKey,
    r.mint,
    registrySigner,
    lamports
  );
  let tx0 = new anchor.web3.Transaction();
  tx0.add(
    ...createSptIx,
    ...createVaultStakeIx,
    ...createVaultPwIx
  );
  let signers0 = [spt, vaultStake, vaultPw];

  const tx = {tx: tx0, signers: signers0};

  return [
    tx,
    {
      spt: spt.publicKey,
      vaultStake: vaultStake.publicKey,
      vaultPw: vaultPw.publicKey,
    },
  ];
}

async function balance(address) {
  return provider.connection.getBalance(address);
}

async function printMemberAccountInfo(memberAccount) {
  console.log("memberAccount.authority: ", memberAccount.authority.toString())
  console.log("memberAccount.metadata: ", memberAccount.metadata.toString())
  console.log("memberAccount.nonce: ", memberAccount.nonce.toString())
  console.log("memberAccount.rewardDebt: ", memberAccount.rewardDebt.toString())

  let memberBalances = memberAccount.balances;

  console.log("memberAccount.balances");
  console.log("spt: ", memberBalances.spt.toString(), " - amount: ", await tokenBalance(memberBalances.spt))
  console.log("vaultStake: ", memberBalances.vaultStake.toString(), " - amount: ", await tokenBalance(memberBalances.vaultStake))
  console.log("vaultPw: ", memberBalances.vaultPw.toString(), " - amount: ", await tokenBalance(memberBalances.vaultPw))

}


async function printStructInfo(name, v) {
  console.log(" ", name);
  console.log("   mint: ", v.mint.toBase58(), " ", await balance(v.mint));
  console.log("   owner: ", v.owner.toBase58(), " ", await balance(v.owner));
  console.log("   amount: ", v.amount.toString());
  console.log("   delegated amount: ", v.delegatedAmount.toString());
}

async function printBalance(name, v) {
  console.log("    ", name);
  console.log("        spt: ", v.spt.toBase58(), " ", await balance(v.spt));
  console.log("        vault: ", v.vault.toBase58(), " ", await balance(v.vault));
  console.log("        vaultStake: ", v.vaultStake.toBase58(), " ", await balance(v.vaultStake));
  console.log("        vaultPendingWithdraw: ", v.vaultPendingWithdraw.toBase58(), " ", await balance(v.vaultPendingWithdraw));
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function tokenBalance(address) {
  return (await provider.connection
    .getTokenAccountBalance(await new anchor.web3.PublicKey(address))).value;
}

function writeConfig(c) {
  let data = JSON.stringify(c);
  fs.writeFileSync('./config.json', data);
}

function readConfig() {
  return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
}
function readIdl() {
  return JSON.parse(fs.readFileSync('../target/idl/ico.json', 'utf8'));

}
module.exports = {
  provider,
  readIdl,
  tokenBalance,
  sleep,
  createBalanceSandbox,
  log_state,
  balance,
  printBalance,
  printStructInfo,
  printMemberAccountInfo,
  readConfig,
  writeConfig
};
