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
const memberSigner = new anchor.web3.PublicKey(config.memberSignerId);

const unlockedVendor = new anchor.web3.PublicKey(config.unlockVendorId);
const unlockedVendorVault = new anchor.web3.PublicKey(config.unlockVendorVaultId);
const unlockedVendorSigner = new anchor.web3.PublicKey(config.unlockVendorSignerId);

let nonce;

// balances & balancesLocked are properties of memberAccount
let memberAccount;
let registrarAccount;

// new account
const pendingWithdrawal = new anchor.web3.Account();

async function main() {

    console.log("----------------------------------------");
    console.log("Start Setup")
    await load_context();

    // Staker vào harvest lợi nhuận từ nhà đầu tư
    await collects_unlocked_reward();
    await log_state();

    // Staker yêu cầu unstake
    await unstacks_unlocked();
    await log_state();

    console.log("wait 5 seconds .....");
    await utils.sleep(5000);

    // Staker kết thúc unstake -> tiền về tài khoản pool stake
    await unstake_finalizes_unlocked();
    await log_state();
    // Rút tiền từ pool stake ra ví ngoài
    await withdraws_deposits_unlocked();
    await log_state();
    await log_state();
}

async function load_context() {
    main_staking_program = new anchor.Program(main_staking_idl, main_staking_program_id);

    memberAccount = await main_staking_program.account.member(member);
    registrarAccount = await main_staking_program.account.registrar(registrar);
}

async function collects_unlocked_reward() {

    console.log("&&&&&&&&&&");
    console.log("invoke claim unlocked reward");

    const token = await serumCmn.createTokenAccount(
        provider,
        mint,
        owner
    );

    console.log("Token account: ", token.toBase58(), " ", await utils.balance(token));

    let tx;

    try {
        tx = await main_staking_program.rpc.claimReward({
            accounts: {
                to: token,
                cmn: {
                    registrar: registrar,
                    member: member,
                    beneficiary: owner,
                    balances: memberAccount.balances,
                    balancesLocked: memberAccount.balancesLocked,

                    vendor: unlockedVendor,
                    vault: unlockedVendorVault,
                    vendorSigner: unlockedVendorSigner,

                    tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                },
            },
        });

    } catch (e) {
        console.log("Error when claim reward: ", e);
    }

    console.log("Claim reward tx ID: ", tx);

    let tokenAccount = await serumCmn.getTokenAccount(provider, token);

    await utils.printStructInfo("tokenAccount", tokenAccount);
    await utils.printMemberAccountInfo("memberAccount", memberAccount);
    console.log("----------------------------------------");
}

async function unstacks_unlocked() {
    console.log("start unstake");
    const unstakeAmount = new anchor.BN(10);

    await main_staking_program.rpc.startUnstake(unstakeAmount, false, {
        accounts: {
            registrar: registrar,
            rewardEventQ: rewardQ,
            poolMint,

            pendingWithdrawal: pendingWithdrawal.publicKey,
            member: member,
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
                registrar: registrar,

                member: member,
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

    // const vault = await serumCmn.getTokenAccount(
    //   provider,
    //   memberAccount.balances.vault
    // );
    // const vaultPendingWithdraw = await serumCmn.getTokenAccount(
    //   provider,
    //   memberAccount.balances.vaultPendingWithdraw
    // );

    // console.log("vault: ", vault);
    // console.log("vaultPendingWithdraw: ", vaultPendingWithdraw);

    // console.log("vault: ");
    // console.log("vaultPendingWithdraw: ");
    // console.log("----------------------------------------");
}

async function withdraws_deposits_unlocked() {

    const token = await serumCmn.createTokenAccount(
        provider,
        mint,
        owner
    );

    const withdrawAmount = new anchor.BN(1000);

    await main_staking_program.rpc.withdraw(withdrawAmount, {
        accounts: {
            registrar: registrar,
            member: member,
            beneficiary: owner,
            vault: memberAccount.balances.vault,
            memberSigner,
            depositor: token,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        },
    });

    const tokenAccount = await serumCmn.getTokenAccount(provider, token);

    console.log("11 tokenAccount: ", tokenAccount);
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
    console.log("member: ", member.toBase58());
    if (registrarAccount) await utils.printRegistrar("registrarAccount", registrarAccount);
    if (registrarSigner) console.log("registrarSigner: ", registrarSigner.toBase58(), " ", await utils.balance(registrarSigner));
    else console.log("registrarSigner: ", registrarSigner);
    console.log("nonce: ", nonce);
    if (poolMint) console.log("poolMint: ", poolMint.toBase58(), " ", await utils.balance(poolMint));
    else console.log("poolMint: ", poolMint);
    if (memberAccount) await utils.printMemberAccountInfo("memberAccount: ", memberAccount);
    if (memberSigner) console.log("memberSigner: ", memberSigner.toString());
    if (balances) await utils.printBalance("balances", balances);
    if (balancesLocked) await utils.printBalance("balancesLocked", balancesLocked);
}

console.log('Running client.');
main().then(() => console.log('Success'));