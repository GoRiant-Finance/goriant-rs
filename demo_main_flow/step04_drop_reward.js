const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("../utils");
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('../config.json', 'utf8'));
//----------------
const main_staking_program_id = new anchor.web3.PublicKey(config.programId);
const provider = anchor.Provider.local('https://api.devnet.solana.com');
anchor.setProvider(provider);

const main_staking_idl = JSON.parse(fs.readFileSync('../target/idl/main_staking.json', 'utf8'));

let main_staking_program = null;

const owner = provider.wallet.publicKey;

// current accounts from config
const mint = new anchor.web3.PublicKey(config.tokenId);
const god = new anchor.web3.PublicKey(config.vaultId);
const registrar = new anchor.web3.PublicKey(config.registrarId);
const rewardQ = new anchor.web3.PublicKey(config.registrar_rewardEventQ);
const registrarSigner = new anchor.web3.PublicKey(config.registrarSigner);
const poolMint = new anchor.web3.PublicKey(config.poolMint);
const member = new anchor.web3.PublicKey(config.memberId);

let memberSigner;
let nonce;
let balances;
let balancesLocked;
let unlockedVendorSigner;
let memberAccount;
let registrarAccount;

// new account
const unlockedVendor = new anchor.web3.Account();
const unlockedVendorVault = new anchor.web3.Account();

async function main() {

  console.log("----------------------------------------");
  console.log("Start Setup")
  await load_context();

  await drops_unlocked_reward();
  await log_state();
}

async function load_context() {
  main_staking_program = new anchor.Program(main_staking_idl, main_staking_program_id);

  memberAccount = await main_staking_program.account.member(member);
  registrarAccount = await main_staking_program.account.registrar(registrar);
}

async function drops_unlocked_reward() {
  console.log("-----------------------")
  console.log("drop unlocked reward");
  const rewardKind = {
    unlocked: {},
  };
  const rewardAmount = new anchor.BN(9999);
  const expiry = new anchor.BN(Date.now() / 1000 + 5);

  const [
    _vendorSigner,
    nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.toBuffer(), unlockedVendor.publicKey.toBuffer()],
    main_staking_program.programId
  );

  unlockedVendorSigner = _vendorSigner;

  await main_staking_program.rpc.dropReward(
    rewardKind,
    rewardAmount,
    expiry,
    owner,
    nonce,
    {
      accounts: {
        registrar: registrar,
        rewardEventQ: rewardQ,
        poolMint,

        vendor: unlockedVendor.publicKey,
        vendorVault: unlockedVendorVault.publicKey,

        depositor: god,
        depositorAuthority: owner,

        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [unlockedVendorVault, unlockedVendor],
      instructions: [
        ...(await serumCmn.createTokenAccountInstrs(
          provider,
          unlockedVendorVault.publicKey,
          mint,
          unlockedVendorSigner
        )),
        await main_staking_program.account.rewardVendor.createInstruction(unlockedVendor),
      ],
    }
  );

  const vendorAccount = await main_staking_program.account.rewardVendor(unlockedVendor.publicKey);
  const rewardQAccount = await main_staking_program.account.rewardQueue(rewardQ);

  await utils.printVendor("vendorAccount", vendorAccount);
  console.log("rewardQAccount: ", rewardQAccount.toString());
  console.log("-----------------------")
}

async function log_state() {
  console.log("main_staking_program_id: ", main_staking_program_id.toBase58(), " ", await utils.balance(main_staking_program_id));
  if (owner) console.log("owner: ", owner.toBase58(), " ", await utils.balance(owner));
  else console.log("owner: ", owner);
  if (mint) console.log("mint: ", mint.toBase58(), " ", await utils.balance(mint));
  else console.log("mint: ", mint);
  if (god) console.log("god: ", god.toBase58(), " ", await utils.balance(god));
  else console.log("god: ", god);
  console.log("registrar: ", registrar.toBase58());
  console.log("rewardQ: ", rewardQ.toBase58());
  console.log("member: ", member.toBase58());
  if (registrarAccount) await utils.printRegistrar("registrarAccount", registrarAccount);
  if (registrarSigner) console.log("registrarSigner: ", registrarSigner.toBase58(), " ", await utils.balance(registrarSigner));
  else console.log("registrarSigner: ", registrarSigner);
  console.log("nonce: ", nonce);
  if (poolMint) console.log("poolMint: ", poolMint.toBase58(), " ", await utils.balance(poolMint));
  else console.log("poolMint: ", poolMint);
  if (memberAccount) await utils.printMemberAccountInfo("memberAccount: ", memberAccount);
  if(memberSigner) console.log("memberSigner: ", memberSigner.toString());
  if (balances) await utils.printBalance("balances", balances);
  if (balancesLocked) await utils.printBalance("balancesLocked", balancesLocked);
  if (unlockedVendor) console.log("unlockedVendor: ", unlockedVendor.publicKey.toBase58());
  if (unlockedVendorVault) console.log("unlockedVendorVault: ", unlockedVendorVault.publicKey.toBase58());
  if (unlockedVendorSigner) console.log("unlockedVendorSigner: ", unlockedVendorSigner.toString());
}

console.log('Running client.');
main().then(() => console.log('Success'));