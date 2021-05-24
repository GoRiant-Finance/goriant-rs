const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const fs = require('fs');
const utils = require("./utils");
const config = utils.readConfig();
const program_id = new anchor.web3.PublicKey(config.programId);

// const provider = anchor.Provider.local('https://devnet.solana.com');
const provider = anchor.Provider.local();
anchor.setProvider(provider);

const idl = JSON.parse(fs.readFileSync('./target/idl/staking.json', 'utf8'));

let program = new anchor.Program(idl, program_id);


async function main() {
    const god = new anchor.web3.PublicKey(config.vault);
    let state = await program.state();
    console.log("state.vendor: ", state.vendor.toString());
    let vendor = await program.account.rewardVendor(state.vendor);
    let drop_amount = new anchor.BN(1000);
    try {
        let tx = await program.rpc.dropReward(
            drop_amount,
            {
                accounts: {
                    rewardEventQueue: state.rewardEventQ,
                    vendor: state.vendor,
                    vendorVault: vendor.vault,
                    depositor: god,
                    depositorAuthority: provider.wallet.publicKey,
                    tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY
                }
            }
        );
        console.log("tx: ", tx);

        console.log("vendor.key: ", state.vendor.toString())
        console.log("vendor.vault: ", vendor.vault.toString(), " - amount: ", await utils.tokenBalance(vendor.vault))
        console.log("vendor.mint: ", vendor.mint.toString())
        console.log("vendor.nonce: ", vendor.nonce.toString())
        console.log("vendor.pool_token_supply: ", vendor.poolTokenSupply.toString())
        console.log("vendor.positionInRewardQueue: ", vendor.positionInRewardQueue.toString())
        console.log("vendor.startTs: ", vendor.startTs.toString())
        console.log("vendor.expiryTs: ", vendor.expiryTs.toString())
        console.log("vendor.expiryReceiver: ", vendor.expiryReceiver.toString())
        console.log("vendor.from: ", vendor.from.toString())
        console.log("vendor.total: ", vendor.total.toString())
        console.log("vendor.expired: ", vendor.expired.toString())
        console.log("vendor.activated: ", vendor.activated.toString())
    } catch (e) {
        console.log("Drop reward Error: ", e);
    }
}

main().then(() => console.log('Success'));