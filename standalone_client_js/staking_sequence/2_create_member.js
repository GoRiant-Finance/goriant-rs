const anchor = require("@project-serum/anchor");
const utils = require("./utils");
const config = utils.readConfig();
const provider = utils.provider;
const program_id = new anchor.web3.PublicKey(config.programId);
const idl = utils.readIdl();
anchor.setProvider(provider);
let program = new anchor.Program(idl, program_id);

async function main() {
    let state_pubKey = await program.state.address();
    let state = await program.state();
    let member = await program.account.member.associatedAddress(provider.wallet.publicKey);
    console.log("member: ", member.toString())
    const [
        memberImprint,
        member_nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [state_pubKey.toBuffer(), member.toBuffer()],
        program.programId
    );

    const [mainTx, balances] = await utils.createBalanceSandbox(provider, state, memberImprint);
    let txSigns = await provider.send(mainTx.tx, mainTx.signers);

    console.log("create balance sandbox tx: ", txSigns);

    try {
        let tx = await program.rpc.createMember(
            member_nonce,
            {
                accounts: {
                    stakingPool: state_pubKey,
                    member: member,
                    authority: provider.wallet.publicKey,
                    balances: balances,
                    memberImprint: memberImprint,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    systemProgram: anchor.web3.SystemProgram.programId
                }
            }
        );
        console.log("tx: ", tx);
    } catch (e) {
        console.log("Create member Error: ", e);
    }
    let memberAccount = await program.account.member.associated(provider.wallet.publicKey);
    await utils.printMemberAccountInfo(memberAccount);
}

main().then(() => console.log('Success'));