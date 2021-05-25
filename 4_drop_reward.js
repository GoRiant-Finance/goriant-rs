const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
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
    const mint = new anchor.web3.PublicKey(config.token);
    const god = new anchor.web3.PublicKey(config.vault);
    let state_address = await program.state.address();
    let state = await program.state();
    let vendor = new anchor.web3.Account();
    let vendorVault = new anchor.web3.Account();
    let drop_amount = new anchor.BN(1000);
    const [
        vendorImprint,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [state_address.toBuffer(), vendor.publicKey.toBuffer()],
        program.programId
    );
    const expiry = new anchor.BN(Date.now() / 1000 + 5);
    try {
        let tx = await program.rpc.dropReward(
            drop_amount,
            expiry,
            provider.wallet.publicKey,
            nonce,
            {
                accounts: {
                    rewardEventQueue: state.rewardEventQ,
                    poolMint: state.poolMint,
                    vendor: vendor.publicKey,
                    vendorVault: vendorVault.publicKey,
                    depositor: god,
                    depositorAuthority: provider.wallet.publicKey,
                    tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY
                },
                signers: [vendorVault, vendor],
                instructions: [
                    ...(await serumCmn.createTokenAccountInstrs(
                        provider,
                        vendorVault.publicKey,
                        mint,
                        vendorImprint
                    )),
                    await program.account.rewardVendor.createInstruction(vendor),
                ]
            }
        );
        console.log("tx: ", tx);

        const vendorAccount = await program.account.rewardVendor(vendor.publicKey);
        console.log("vendor.key: ", vendor.publicKey.toString())
        console.log("vendor.vault: ", vendorVault.publicKey.toString(), " - amount: ", await utils.tokenBalance(vendorVault.publicKey))
        console.log("vendor.mint: ", vendorAccount.mint.toString())
        console.log("vendor.nonce: ", vendorAccount.nonce.toString())
        console.log("vendor.pool_token_supply: ", vendorAccount.poolTokenSupply.toString())
        console.log("vendor.currentRewardPosition: ", vendorAccount.currentRewardPosition.toString())
        console.log("vendor.startTs: ", vendorAccount.startTs.toString())
        console.log("vendor.expiryTs: ", vendorAccount.expiryTs.toString())
        console.log("vendor.expiryReceiver: ", vendorAccount.expiryReceiver.toString())
        console.log("vendor.from: ", vendorAccount.from.toString())
        console.log("vendor.total: ", vendorAccount.total.toString())
        console.log("vendor.expired: ", vendorAccount.expired.toString())
        console.log("vendor.activated: ", vendorAccount.activated.toString())
    } catch (e) {
        console.log("Drop reward Error: ", e);
    }
}

main().then(() => console.log('Success'));