const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
//----------------
const main_staking_program_id = new anchor.web3.PublicKey(config.programId);
const provider = anchor.Provider.local();
anchor.setProvider(provider);

const main_staking_idl = JSON.parse(fs.readFileSync('./target/idl/main_staking.json', 'utf8'));

let main_staking_program = null;

//--------
let mint = null;
let god = null;

const owner = provider.wallet.publicKey;
const registrar = new anchor.web3.Account();
const rewardQ = new anchor.web3.Account();
const member = new anchor.web3.Account();

const pendingWithdrawal = new anchor.web3.Account();
const unlockedVendor = new anchor.web3.Account();
const unlockedVendorVault = new anchor.web3.Account();

const withdrawalTimelock = new anchor.BN(4);
const stakeRate = new anchor.BN(2);
const rewardQLen = 170;
let registrarAccount = null;
let registrarSigner = null;
let nonce = null;
let poolMint = null;


let memberAccount = null;
let memberSigner = null;
let balances = null;
let balancesLocked = null;

let unlockedVendorSigner = null;

async function log_state() {
  console.log("main_staking_program_id: ", main_staking_program_id.toBase58() , " " , await balance(main_staking_program_id));
  if (owner) console.log("owner: ", owner.toBase58(), " " , await balance(owner));
  else console.log("owner: ", owner);
  if (mint) console.log("mint: ", mint.toBase58(), " " , await balance(mint));
  else console.log("mint: ", mint);
  if (god) console.log("god: " , god.toBase58(), " " , await balance(god));
  else console.log("god: ", god);
  console.log("registrar: " , registrar.publicKey.toBase58());
  console.log("rewardQ: " , rewardQ.publicKey.toBase58());
  console.log("member: " , member.publicKey.toBase58());
  console.log("pendingWithdrawal: " , pendingWithdrawal.publicKey.toBase58());
  console.log("unlockedVendor: " , unlockedVendor.publicKey.toBase58());
  console.log("unlockedVendorVault: " , unlockedVendorVault.publicKey.toBase58());
  console.log("registrarAccount: ", registrarAccount);
  if (registrarSigner) console.log("registrarSigner: " , registrarSigner.toBase58() , " " , await balance(registrarSigner));
  else console.log("registrarSigner: ", registrarSigner);
  console.log("nonce: " , nonce);
  if (poolMint) console.log("poolMint: " , poolMint.toBase58() , " " , await balance(poolMint));
  else console.log("poolMint: ", poolMint);
  console.log("memberAccount: ", memberAccount);
  console.log("memberSigner: " , memberSigner);
  if (balances) await printBalance("balances", balances);
  if (balancesLocked) await printBalance("balancesLocked", balancesLocked);
  console.log("unlockedVendorSigner: " , unlockedVendorSigner);

  // console.log("registrarAccount.authority: ", registrarAccount.authority.toString(), " ", await balance(registrarAccount.authority));
  // console.log("registrarAccount.rewardEventQ: ", registrarAccount.rewardEventQ.toString(), " ", await balance(registrarAccount.rewardEventQ));
  // console.log("registrarAccount.mint: ", registrarAccount.mint.toString(), " ", await balance(registrarAccount.mint));
  // console.log("registrarAccount.stakeRate: ", registrarAccount.stakeRate.toString(), "%");
  // console.log("registrarAccount.withdrawalTimelock: ", registrarAccount.withdrawalTimelock.toString());



}

async function main() {
  console.log("----------------------------------------");
  console.log("Start Setup")
  await log_state();
  await load_program();
  await set_up_state();
  await create_registry_genesis();
  await log_state();
  console.log("End Setup")
  console.log("----------------------------------------");

  // Tạo pool stake chung
  await initialize_registrar();
  await log_state();
  // Đăng kí để stake
  await create_member();
  await log_state();
  // Nạp tiền vào tài khoản trong pool stake
  await deposit_unlocked_member();
  await log_state();
  // Thực hiện stake
  await stake_unlocked_member();
  await log_state();
  // Nhà đầu tư abc đổ tiền vào làm phần thưởng cho các staker
  await drops_unlocked_reward();
  await log_state();
  // Staker vào harvest lợi nhuận từ nhà đầu tư
  await collects_unlocked_reward();
  await log_state();
  // Staker yêu cầu unstake
  await unstacks_unlocked();
  await log_state();
  console.log("wait 5 seconds .....");
  await sleep(5000);

  // Staker kết thúc unstake -> tiền về tài khoản pool stake
  await unstake_finalizes_unlocked();
  await log_state();
  // Rút tiền từ pool stake ra ví ngoài
  await withdraws_deposits_unlocked();
  await log_state();
}

async function load_program() {
  main_staking_program = new anchor.Program(main_staking_idl, main_staking_program_id);
}

async function set_up_state() {
  // we are owner of both
  // init new mint account and vault account associate with mint
  const [_mint, _god] = await serumCmn.createMintAndVault(
    provider,
    new anchor.BN(1000000)
  );
  mint = _mint;
  god = _god;

  console.log(" main_staking_program_id: ", main_staking_program_id.toBase58(), " ", await balance(main_staking_program_id));
  console.log(" owner: ", owner.toBase58(), " ", await balance(owner));
  console.log(" mint: ", mint.toBase58(), " ", await balance(mint));
  console.log(" god: ", god.toBase58(), " ", await balance(god));
}

async function create_registry_genesis() {
  const [
    _registrarSigner,
    _nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.publicKey.toBuffer()],
    main_staking_program.programId
  );
  registrarSigner = _registrarSigner;
  nonce = _nonce;

  poolMint = await serumCmn.createMint(provider, registrarSigner);

  await sendSol(registrarSigner, 1_000_000);

  console.log(" poolMint: ", poolMint.toBase58(), " ", await balance(poolMint));
  console.log(" registrarSigner: ", registrarSigner.toBase58(), " ", await balance(registrarSigner));
  console.log(" nonce: ", nonce);
}

async function initialize_registrar() {
  await main_staking_program.rpc.initialize(
    mint,
    owner,
    nonce,
    withdrawalTimelock,
    stakeRate,
    rewardQLen,
    {
      accounts: {
        registrar: registrar.publicKey,
        poolMint,
        rewardEventQ: rewardQ.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [registrar, rewardQ],
      instructions: [
        await main_staking_program.account.registrar.createInstruction(registrar),
        await main_staking_program.account.rewardQueue.createInstruction(rewardQ, 8250),
      ],
    });


  registrarAccount = await main_staking_program.account.registrar(registrar.publicKey);

  console.log("#####");
  console.log("invoke init staking program")
  console.log("registrarAccount.authority: ", registrarAccount.authority.toString(), " ", await balance(registrarAccount.authority));
  console.log("registrarAccount.rewardEventQ: ", registrarAccount.rewardEventQ.toString(), " ", await balance(registrarAccount.rewardEventQ));
  console.log("registrarAccount.mint: ", registrarAccount.mint.toString(), " ", await balance(registrarAccount.mint));
  console.log("registrarAccount.stakeRate: ", registrarAccount.stakeRate.toString(), "%");
  console.log("registrarAccount.withdrawalTimelock: ", registrarAccount.withdrawalTimelock.toString());
  console.log("#####");
  console.log("----------------------------------------");
}

async function create_member() {
  const [
    _memberSigner,
    nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.publicKey.toBuffer(), member.publicKey.toBuffer()],
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
      registrar: registrar.publicKey,
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

  console.log("$$$$$$$$$$")
  console.log("invoke createMember")

  await printBalance("balances", balances);
  await printBalance("balancesLocked", balancesLocked);

  console.log("Send SOL to memberSigner");
  await sendSol(memberSigner, 2_000_000);
  console.log("$$$$$$$$$$")
  console.log("----------------------------------------");
}

async function deposit_unlocked_member() {
  console.log("########");
  console.log("invoke deposit 120 Token")
  const depositAmount = new anchor.BN(120);

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
  console.log("memberVault.mint: ", memberVault.mint.toString(), " ", await balance(memberVault.mint));
  console.log("memberVault.owner: ", memberVault.owner.toString(), " ", await balance(memberVault.owner));
  console.log("########");
  console.log("----------------------------------------");
}

async function stake_unlocked_member() {
  console.log("****************")
  console.log("invoke stake for unlocked member")
  const stakeAmount = new anchor.BN(10);

  await main_staking_program.rpc.stake(stakeAmount, false, {
    accounts: {
      // Stake instance.
      registrar: registrar.publicKey,
      rewardEventQ: rewardQ.publicKey,
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

  await printStructInfo("vault", vault)
  await printStructInfo("vaultStake", vaultStake)
  await printStructInfo("spt", spt);
  console.log("----------------------------------------");

}

async function drops_unlocked_reward() {
  console.log("###########")
  console.log("invoke drop unlocked reward");
  const rewardKind = {
    unlocked: {},
  };
  const rewardAmount = new anchor.BN(200);
  const expiry = new anchor.BN(Date.now() / 1000 + 5);

  const [
    _vendorSigner,
    nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.publicKey.toBuffer(), unlockedVendor.publicKey.toBuffer()],
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
        registrar: registrar.publicKey,
        rewardEventQ: rewardQ.publicKey,
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
  const rewardQAccount = await main_staking_program.account.rewardQueue(rewardQ.publicKey);

  await printVendor("vendorAccount", vendorAccount);
  console.log("rewardQAccount: ", rewardQAccount.toString());
  console.log("----------------------------------------");
}

async function collects_unlocked_reward() {

  console.log("&&&&&&&&&&");
  console.log("invoke claim unlocked reward");

  const token = await serumCmn.createTokenAccount(
    provider,
    mint,
    owner
  );

  console.log("Token account: ", token.toBase58(), " ", await balance(token));

  await main_staking_program.rpc.claimReward({
    accounts: {
      to: token,
      cmn: {
        registrar: registrar.publicKey,

        member: member.publicKey,
        beneficiary: owner,
        balances,
        balancesLocked,

        vendor: unlockedVendor.publicKey,
        vault: unlockedVendorVault.publicKey,
        vendorSigner: unlockedVendorSigner,

        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    },
  });

  let tokenAccount = await serumCmn.getTokenAccount(provider, token);
  const memberAccount = await main_staking_program.account.member(member.publicKey);

  await printStructInfo("tokenAccount", tokenAccount);
  await printMemberAccountInfo("memberAccount", memberAccount);
  console.log("----------------------------------------");
}

async function unstacks_unlocked() {
  console.log("start unstake");
  const unstakeAmount = new anchor.BN(10);

  await main_staking_program.rpc.startUnstake(unstakeAmount, false, {
    accounts: {
      registrar: registrar.publicKey,
      rewardEventQ: rewardQ.publicKey,
      poolMint,

      pendingWithdrawal: pendingWithdrawal.publicKey,
      member: member.publicKey,
      beneficiary: owner,
      balances,
      balancesLocked,

      memberSigner,

      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [pendingWithdrawal],
    instructions: [
      await main_staking_program.account.pendingWithdrawal.createInstruction(
        pendingWithdrawal
      ),
    ],
  });

  const vaultPendingWithdraw = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vaultPendingWithdraw
  );
  const vaultStake = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vaultStake
  );
  const spt = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.spt
  );

  console.log("vaultPendingWithdraw: ", vaultPendingWithdraw.toString());
  console.log("vaultStake: ", vaultStake.toString());
  console.log("spt: ", spt.toString());
  console.log("----------------------------------------");
}

async function try_end_unstake() {

  console.log("#########")
  console.log("invoke end_unstake")

  let tx;
  try {
    tx = await main_staking_program.rpc.endUnstake({
      accounts: {
        registrar: registrar.publicKey,

        member: member.publicKey,
        beneficiary: owner,
        pendingWithdrawal: pendingWithdrawal.publicKey,

        vault: balances.vault,
        vaultPendingWithdraw: balances.vaultPendingWithdraw,

        memberSigner,

        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });
  } catch (e) {
    console.log("Error when call end unstake: ", e)
  }

  console.log("End endUnstake")
  console.log("#########")
  console.log("")
}

async function unstake_finalizes_unlocked() {
  await try_end_unstake();

  const vault = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vault
  );
  const vaultPendingWithdraw = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vaultPendingWithdraw
  );

  // console.log("vault: ", vault);
  // console.log("vaultPendingWithdraw: ", vaultPendingWithdraw);

  console.log("vault: ");
  console.log("vaultPendingWithdraw: ");
  console.log("----------------------------------------");
}

async function withdraws_deposits_unlocked() {
  const token = await serumCmn.createTokenAccount(
    provider,
    mint,
    owner
  );
  const withdrawAmount = new anchor.BN(100);
  await main_staking_program.rpc.withdraw(withdrawAmount, {
    accounts: {
      registrar: registrar.publicKey,
      member: member.publicKey,
      beneficiary: owner,
      vault: memberAccount.balances.vault,
      memberSigner,
      depositor: token,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
    },
  });

  const tokenAccount = await serumCmn.getTokenAccount(provider, token);
  // console.log("11 tokenAccount: ", tokenAccount);
  console.log("11 tokenAccount: ", tokenAccount);
  console.log("----------------------------------------");

}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function balance(address) {
  return provider.connection.getBalance(address);
}

async function sendSol(receiver, amount) {
  console.log(" from: ", owner.toBase58(), "to receiver: ", receiver.toString(), " Sending: ", amount);
  const transferTx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: receiver,
      lamports: amount,
    }),
  );

  await provider.connection.sendTransaction(transferTx, [provider.wallet.payer]);
  await sleep(500);
}

async function printStructInfo(name, v) {
  console.log(" ", name);
  console.log("   mint: ", v.mint.toBase58(), " ", await balance(v.mint));
  console.log("   owner: ", v.owner.toBase58(), " ", await balance(v.owner));
  console.log("   amount: ", v.amount.toString());
  console.log("   delegated amount: ", v.delegatedAmount.toString());
}

async function printMemberAccountInfo(name, v) {
  console.log("  ", name);
  console.log("   registrar: ", v.registrar.toBase58(), " ", await balance(v.registrar));
  console.log("   beneficiary: ", v.beneficiary.toBase58(), " ", await balance(v.beneficiary));
  console.log("   metadata: ", v.metadata.toBase58(), " ", await balance(v.metadata));
  await printBalance("member.balances", v.balances);
  await printBalance("member.balancesLocked", v.balancesLocked);
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

async function printBalance(name, v) {
  console.log("    ", name);
  console.log("        spt: ", v.spt.toBase58(), " ", await balance(v.spt));
  console.log("        vault: ", v.vault.toBase58(), " ", await balance(v.vault));
  console.log("        vaultStake: ", v.vaultStake.toBase58(), " ", await balance(v.vaultStake));
  console.log("        vaultPendingWithdraw: ", v.vaultPendingWithdraw.toBase58(), " ", await balance(v.vaultPendingWithdraw));
}

console.log('Running client.');
main().then(() => console.log('Success'));