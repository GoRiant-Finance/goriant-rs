const anchor = require("@project-serum/anchor");
const utils = require("./utils");
const config = utils.readConfig();
const program_id = new anchor.web3.PublicKey(config.programId);
const sol = require("@solana/spl-token");
const provider = utils.provider;
const idl = utils.readIdl();
anchor.setProvider(provider);

let program = new anchor.Program(idl, program_id);
async function main() {
    let state_pubKey = await program.state.address();
    let state = await program.state();
    let member = await program.account.member.associatedAddress(provider.wallet.publicKey);
    let memberAccount = await program.account.member.associated(provider.wallet.publicKey);
    let balances = memberAccount.balances;

    try {
        let tx = await program.rpc.calPendingReward(
            {
                accounts: {
                    stakingPool: state_pubKey,
                    poolMint: state.poolMint,
                    member: member,
                    authority: provider.wallet.publicKey,
                    balances: balances,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                }
            }
        );
        console.log("tx: ", tx);
    } catch (e) {
        console.log("Stake Error: ", e);
    }
    // load new state
    state = await program.state();
    await utils.log_state(state);
}

main().then(() => console.log('Success'));