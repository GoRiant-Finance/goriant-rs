const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");

//----------------
const main_staking_programId = new anchor.web3.PublicKey("CFYqtuS31jnfkSrSVmfDoFgDPj8YmR3Hp6MDgteMpgP7");
const provider = anchor.Provider.local();
anchor.setProvider(provider);
const fs = require('fs');
const main_staking_idl = JSON.parse(fs.readFileSync('./target/idl/main_staking.json', 'utf8'));

let main_staking_program = null;

//----------------
const entries = [];
const WHITELIST_SIZE = 10;

//--------
let mint = null;
let god = null;

//----create vesting account
const vesting = new anchor.web3.Account();
let vestingAccount = null;
let vestingSigner = null;

const registrar = new anchor.web3.Account();
const rewardQ = new anchor.web3.Account();
const withdrawalTimelock = new anchor.BN(4);
const stakeRate = new anchor.BN(2);
const rewardQLen = 170;
let registrarAccount = null;
let registrarSigner = null;
let nonce = null;
let poolMint = null;

const member = new anchor.web3.Account();
let memberAccount = null;
let memberSigner = null;
let balances = null;
let balancesLocked = null;

const unlockedVendor = new anchor.web3.Account();
const unlockedVendorVault = new anchor.web3.Account();
let unlockedVendorSigner = null;

const lockedVendor = new anchor.web3.Account();
const lockedVendorVault = new anchor.web3.Account();
let lockedVendorSigner = null;
let lockedRewardAmount = null;
let lockedRewardKind = null;

let vendoredVesting = null;
let vendoredVestingVault = null;
let vendoredVestingSigner = null;

const pendingWithdrawal = new anchor.web3.Account();

const owner = provider.wallet.publicKey;

async function main() {

    await load_program();

    await set_up_state();

    await create_registry_genesis();

    await initialize_registrar();

    await create_member();

    await deposit_unlocked_member();

    await stake_unlocked_member();

    await drops_unlocked_reward();

    await collects_unlocked_reward();

    await unstake_finalizes_unlocked();

    await withdraws_deposits_unlocked();
}
async function load_program() {
    main_staking_program = new anchor.Program(main_staking_idl, main_staking_programId);
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
    console.log("mint: ", mint.toBase58());
    console.log("god: ", god.toBase58());
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
    console.log("registrarSigner: ", registrarSigner.toBase58());
    console.log("nonce: ", nonce);

    poolMint = await serumCmn.createMint(provider, registrarSigner);
    console.log("poolMing: ", poolMint.toBase58());
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

    // console.log("registrarAccount: ", registrarAccount);
    console.log("registrarAccount: ");
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

    const allTxs = [mainTx, lockedTx, { tx, signers }];

    let txSigs = await provider.sendAll(allTxs);

    memberAccount = await main_staking_program.account.member(member.publicKey);

    // console.log("memberAccount: ", memberAccount);
    console.log("memberAccount 1: ")
    console.log("balances: ", balances.toString());
    console.log("balancesLocked: ", balancesLocked.toString());
}
async function deposit_unlocked_member() {
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

    const memberVault = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vault
    );
    // console.log("memberVault: ", memberVault);
    console.log("memberVault: ");
}
async function stake_unlocked_member() {
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

    // console.log("vault: ", vault);
    // console.log("vaultState: ", vaultStake);
    // console.log("spt: ", spt);

    console.log("vault: ");
    console.log("vaultState: ");
    console.log("spt: ");
}
async function drops_unlocked_reward() {
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

    const vendorAccount = await main_staking_program.account.rewardVendor(
      unlockedVendor.publicKey
    );

    // console.log("vendorAccount: ", vendorAccount);
    console.log("vendorAccount: ");

    const rewardQAccount = await main_staking_program.account.rewardQueue(
      rewardQ.publicKey
    );
    // console.log("rewardQAccount: ", rewardQAccount);
    // console.log("unlockedVendor: ", unlockedVendor);

    console.log("rewardQAccount: ");
    console.log("unlockedVendor: ");
}
async function collects_unlocked_reward() {
    const token = await serumCmn.createTokenAccount(
      provider,
      mint,
      owner
    );
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
    // console.log("tokenAccount: ", tokenAccount);
    console.log("tokenAccount: ");
    const memberAccount = await main_staking_program.account.member(member.publicKey);
    // console.log("memberAccount: ", memberAccount);
    console.log("memberAccount 2: ");
}

async function unstacks_unlocked() {
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

    const vaultPw = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vaultPw
    );
    const vaultStake = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vaultStake
    );
    const spt = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.spt
    );

    // console.log("vaultPw: ", vaultPw);
    // console.log("vaultStake: ", vaultStake);
    // console.log("spt: ", spt);

    console.log("vaultPw: ");
    console.log("vaultStake: ");
    console.log("spt: ");
}
async function try_end_unstake() {
        await main_staking_program.rpc.endUnstake({
            accounts: {
                registrar: registrar.publicKey,

                member: member.publicKey,
                beneficiary: owner,
                pendingWithdrawal: pendingWithdrawal.publicKey,

                vault: balances.vault,
                vaultPw: balances.vaultPw,

                memberSigner,

                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
            },
        });
}
async function unstake_finalizes_unlocked() {
    await try_end_unstake();

    const vault = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vault
    );
    const vaultPw = await serumCmn.getTokenAccount(
      provider,
      memberAccount.balances.vaultPw
    );

    // console.log("vault: ", vault);
    // console.log("vaultPw: ", vaultPw);

    console.log("vault: ");
    console.log("vaultPw: ");
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
    console.log("11 tokenAccount: ");
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

console.log('Running client.');
main().then(() => console.log('Success'));