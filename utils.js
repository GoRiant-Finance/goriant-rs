const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const fs = require('fs');

const provider = anchor.Provider.local('https://api.devnet.solana.com');

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

async function printMemberAccountInfo(name, v) {
  console.log("  ", name);
  console.log("   registrar: ", v.registrar.toBase58(), " ", await balance(v.registrar));
  console.log("   beneficiary: ", v.beneficiary.toBase58(), " ", await balance(v.beneficiary));
  console.log("   metadata: ", v.metadata.toBase58(), " ", await balance(v.metadata));
  await printBalance("member.balances", v.balances);
  await printBalance("member.balancesLocked", v.balancesLocked);
}


async function printStructInfo(name, v) {
  console.log(" ", name);
  console.log("   mint: ", v.mint.toBase58(), " ", await balance(v.mint));
  console.log("   owner: ", v.owner.toBase58(), " ", await balance(v.owner));
  console.log("   amount: ", v.amount.toString());
  console.log("   delegated amount: ", v.delegatedAmount.toString());
}

async function printRegistrar(name, v) {
  console.log("    ", name)
  console.log("        registrarAccount.authority: ", v.authority.toBase58(), " ", await balance(v.authority));
  console.log("        registrarAccount.rewardEventQ: ", v.rewardEventQ.toBase58(), " ", await balance(v.rewardEventQ));
  console.log("        registrarAccount.mint: ", v.mint.toBase58(), " ", await balance(v.mint));
  console.log("        registrarAccount.poolMint: ", v.poolMint.toBase58(), " ", await balance(v.poolMint));
}

async function printBalance(name, v) {
  console.log("    ", name);
  console.log("        spt: ", v.spt.toBase58(), " ", await balance(v.spt));
  console.log("        vault: ", v.vault.toBase58(), " ", await balance(v.vault));
  console.log("        vaultStake: ", v.vaultStake.toBase58(), " ", await balance(v.vaultStake));
  console.log("        vaultPendingWithdraw: ", v.vaultPendingWithdraw.toBase58(), " ", await balance(v.vaultPendingWithdraw));
}

async function printVendor(name, v) {
  console.log("  ", name);
  console.log("   registrar: ", v.registrar.toBase58(), " ", await balance(v.registrar));
  console.log("   vault: ", v.vault.toBase58(), " ", await balance(v.vault));
  console.log("   mint: ", v.mint.toBase58(), " ", await balance(v.mint));
  console.log("   from: ", v.from.toBase58(), " ", await balance(v.from));

  console.log("   poolTokenSupply: ", v.poolTokenSupply.toString());
  console.log("   total: ", v.total.toString());
  console.log("   kind: ", JSON.stringify(v.kind));
}

async function printRegistrarSigner(registrarAccount) {

  console.log("registrarAccount.authority: ", registrarAccount.authority.toString(), " ", await balance(registrarAccount.authority));
  console.log("registrarAccount.rewardEventQ: ", registrarAccount.rewardEventQ.toString(), " ", await balance(registrarAccount.rewardEventQ));
  console.log("registrarAccount.mint: ", registrarAccount.mint.toString(), " ", await balance(registrarAccount.mint));
  console.log("registrarAccount.stakeRate: ", registrarAccount.stakeRate.toString(), "%");
  console.log("registrarAccount.withdrawalTimelock: ", registrarAccount.withdrawalTimelock.toString());
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

module.exports = {
  tokenBalance,
  sleep,
  createBalanceSandbox,
  balance,
  printBalance,
  printRegistrar,
  printStructInfo,
  printMemberAccountInfo,
  printVendor,
  printRegistrarSigner,
  readConfig,
  writeConfig,
  provider
};
