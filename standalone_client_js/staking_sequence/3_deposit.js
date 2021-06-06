const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const { ASSOCIATED_TOKEN_PROGRAM_ID, Token } = require('@solana/spl-token');
const utils = require("./utils");
const config = utils.readConfig();
const provider = utils.provider;
const program_id = new anchor.web3.PublicKey(config.programId);
const idl = utils.readIdl();
const tokenInLamport = anchor.web3.LAMPORTS_PER_SOL;
anchor.setProvider(provider);
let program = new anchor.Program(idl, program_id);

async function main() {

    const owner = provider.wallet.publicKey;
    const mint = new anchor.web3.PublicKey(config.token);

    const god = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TokenInstructions.TOKEN_PROGRAM_ID,
      mint,
      owner
    )

    let state_pubKey = await program.state.address();
    let state = await program.state();
    let member = await program.account.member.associatedAddress(provider.wallet.publicKey);
    let memberAccount = await program.account.member.associated(provider.wallet.publicKey);
    console.log("member: ", member.toString())
    let balances = memberAccount.balances;
    const [
        memberImprint,
        member_nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [state_pubKey.toBuffer(), member.toBuffer()],
        program.programId
    );

    let deposit_amount = new anchor.BN(500 * tokenInLamport);
    try {
        let tx = await program.rpc.deposit(
            deposit_amount,
            {
                accounts: {
                    stakingPool: state_pubKey,
                    poolMint: state.poolMint,
                    imprint: state.imprint,
                    rewardVault: state.rewardVault,
                    member: member,
                    authority: provider.wallet.publicKey,
                    balances: balances,
                    memberImprint: memberImprint,
                    depositor: god,
                    depositorAuthority: provider.wallet.publicKey,
                    tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY
                }
            }
        );
        console.log("tx: ", tx);
    } catch (e) {
        console.log("Stake Error: ", e);
    }
    memberAccount = await program.account.member.associated(provider.wallet.publicKey);
    await utils.printMemberAccountInfo(memberAccount);
    // load new state
    state = await program.state();
    await utils.log_state(state);
}

main().then(() => console.log('Success'));