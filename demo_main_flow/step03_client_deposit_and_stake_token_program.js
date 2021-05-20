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
// current accounts
const mint = new anchor.web3.PublicKey(config.tokenId);
const god = new anchor.web3.PublicKey(config.vaultId);
const registrar = new anchor.web3.PublicKey(config.registrarId);
const rewardQ = new anchor.web3.PublicKey(config.registrar_rewardEventQ);
const registrarSigner = new anchor.web3.PublicKey(config.registrarSigner);
const poolMint = new anchor.web3.PublicKey(config.poolMint);

let registrarAccount;
let memberSigner;
let nonce;
let memberAccount;
let balances;
let balancesLocked;

// new accounts
const member = new anchor.web3.Account();


async function main() {

  console.log("----------------------------------------");
  console.log("Start Setup")
  await log_state();
  await load_context();

  // Đăng kí để stake
  await create_member();
  await log_state();

  // Nạp tiền vào tài khoản trong pool stake
  await deposit_unlocked_member();
  await log_state();

  // Thực hiện stake
  await stake_unlocked_member();
  await log_state();
}

async function load_context() {
  main_staking_program = new anchor.Program(main_staking_idl, main_staking_program_id);

  registrarAccount = await main_staking_program.account.registrar(registrar);
}

async function create_member() {
  console.log("----------------------------------------");
  console.log("create member")
  const [
    _memberSigner,
    nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.toBuffer(), member.publicKey.toBuffer()],
    main_staking_program.programId
  );
  memberSigner = _memberSigner;

  const [mainTx, _balances] = await utils.createBalanceSandbox(
    provider,
    registrarAccount,
    memberSigner
  );
  const [lockedTx, _balancesLocked] = await utils.createBalanceSandbox(
    provider,
    registrarAccount,
    memberSigner
  );

  balances = _balances;
  balancesLocked = _balancesLocked;

  const tx = main_staking_program.transaction.createMember(nonce, {
    accounts: {
      registrar,
      member: member.publicKey,
      beneficiary: owner,
      memberSigner,
      balances,
      balancesLocked,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    instructions: [await main_staking_program.account.member.createInstruction(member)],
  });

  const signers = [member, provider.wallet.payer];

  const allTxs = [mainTx, lockedTx, {tx, signers}];

  let txSigs = await provider.sendAll(allTxs);

  memberAccount = await main_staking_program.account.member(member.publicKey);
  console.log("----------------------------------------");
}

async function deposit_unlocked_member() {
  console.log("########");
  console.log("invoke deposit Token")
  const depositAmount = new anchor.BN(8888);

  await main_staking_program.rpc.deposit(depositAmount, {
    accounts: {
      depositor: god,
      depositorAuthority: owner,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      vault: memberAccount.balances.vault,
      beneficiary: owner,
      member: member.publicKey,
    },
  });

  console.log("invoke serum common get token account from member account balances vault")
  const memberVault = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vault
  );
  console.log("memberVault.mint: ", memberVault.mint.toString(), " ", await utils.balance(memberVault.mint));
  console.log("memberVault.owner: ", memberVault.owner.toString(), " ", await utils.balance(memberVault.owner));
  console.log("########");
  console.log("----------------------------------------");
}

async function stake_unlocked_member() {
  console.log("****************")
  console.log("invoke stake for unlocked member")
  const stakeAmount = new anchor.BN(2222);

  await main_staking_program.rpc.stake(stakeAmount, false, {
    accounts: {
      // Stake instance.
      registrar: registrar,
      rewardEventQ: rewardQ,
      poolMint,
      // Member.
      member: member.publicKey,
      beneficiary: owner,
      balances,
      balancesLocked,
      // Program signers.
      memberSigner,
      registrarSigner,
      // Misc.
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
    },
  });

  const vault = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vault
  );
  const vaultStake = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vaultStake
  );
  const spt = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.spt
  );

  await utils.printStructInfo("vault", vault)
  await utils.printStructInfo("vaultStake", vaultStake)
  await utils.printStructInfo("spt", spt);
  console.log("----------------------------------------");

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
  console.log("member: ", member.publicKey.toBase58());
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
}

console.log('Running client.');
main().then(() => console.log('Success'));