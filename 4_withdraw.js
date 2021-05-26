const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const fs = require('fs');
const utils = require("./utils");
const config = utils.readConfig();
const program_id = new anchor.web3.PublicKey(config.programId);

const provider = anchor.Provider.local('https://devnet.solana.com');
// const provider = anchor.Provider.local();
anchor.setProvider(provider);

const idl = JSON.parse(fs.readFileSync('./target/idl/staking.json', 'utf8'));

let program = new anchor.Program(idl, program_id);


async function main() {
    const mint = new anchor.web3.PublicKey(config.token);
    let state_pubKey = await program.state.address();
    let state = await program.state();
    let member = await program.account.member.associatedAddress(provider.wallet.publicKey);
    let memberAccount = await program.account.member.associated(provider.wallet.publicKey);
    let balances = memberAccount.balances;
    const [
        memberImprint,
        member_nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [state_pubKey.toBuffer(), member.toBuffer()],
        program.programId
    );
    const token_account = await serumCmn.createTokenAccount(
        provider,
        mint,
        provider.wallet.publicKey
    );
    console.log("token account: ", token_account.toString(), " - amount: ", await utils.tokenBalance(token_account));
    let withdraw_amount = new anchor.BN(10000);
    try {
        let tx = await program.rpc.withdraw(
            withdraw_amount,
            {
                accounts: {
                    stakingPool: state_pubKey,
                    poolMint: state.poolMint,
                    member: member,
                    authority: provider.wallet.publicKey,
                    balances: balances,
                    memberImprint: memberImprint,
                    beneficial: token_account,
                    beneficialAuthority: provider.wallet.publicKey,
                    tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                }
            }
        );
        console.log("tx: ", tx);
        console.log("token account: ", token_account.toString(), " - amount: ", await utils.tokenBalance(token_account));



    } catch (e) {
        console.log("Stake Error: ", e);
    }
    memberAccount = await program.account.member.associated(provider.wallet.publicKey);
    await utils.printMemberAccountInfo(memberAccount);
    // load new state
    state = await program.state();
    await utils.log_state(state);
    let token_accounts = (await provider.connection.getTokenAccountsByOwner(provider.wallet.publicKey, {mint: mint})).value;
    for (const account of token_accounts) {
        console.log("account: ", account.pubkey.toString(), " - amount: ", await utils.tokenBalance(account.pubkey));
    }
}

main().then(() => console.log('Success'));