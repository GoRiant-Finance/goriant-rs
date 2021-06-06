const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const { ASSOCIATED_TOKEN_PROGRAM_ID, Token } = require('@solana/spl-token');
const utils = require("./utils");
const config = utils.readConfig();
const provider = utils.provider;
const program_id = new anchor.web3.PublicKey(config.programId);
const idl = utils.readIdl();
anchor.setProvider(provider);
let program = new anchor.Program(idl, program_id);


async function main() {
    const tokenInLamport = 1000000000;

    const owner = provider.wallet.publicKey;
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
    const token_account = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TokenInstructions.TOKEN_PROGRAM_ID,
      mint,
      owner
    )
    console.log("token account: ", token_account.toString(), " - amount: ", await utils.tokenBalance(token_account));
    let withdraw_amount = new anchor.BN(29 * tokenInLamport);
    try {
        let tx = await program.rpc.withdraw(
            withdraw_amount,
            {
                accounts: {
                    stakingPool: state_pubKey,
                    imprint: state.imprint,
                    poolMint: state.poolMint,
                    rewardVault: state.rewardVault,
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