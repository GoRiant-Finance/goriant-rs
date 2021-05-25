const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
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
    const [mint, god] = await serumCmn.createMintAndVault(
        provider,
        new anchor.BN(1000000)
    );

    config.token = mint.toBase58();
    config.vault = god.toBase58();
    utils.writeConfig(config);

    console.log("mint: ", mint.toString());
    console.log("god: ", god.toString());
    try {
        const stateRate = new anchor.BN(10);
        const withdrawTimeLock = new anchor.BN(10);
        const start_block = new anchor.BN(new Date().getTime());
        const end_block = new anchor.BN(new Date().getTime());
        const reward_per_block = new anchor.BN(0);
        let state_pubKey = await program.state.address();
        const [staking_pool_imprint, state_imprint_nonce] = await anchor.web3.PublicKey.findProgramAddress(
            [state_pubKey.toBuffer()],
            program.programId
        );

        /// pool mint with state authority
        const poolMint = await serumCmn.createMint(provider, staking_pool_imprint);

        let tx = await program.state.rpc.new(
            mint,
            state_pubKey,
            state_imprint_nonce,
            stateRate,
            withdrawTimeLock,
            start_block,
            reward_per_block,
            end_block,
            {
                accounts: {
                    authority: provider.wallet.publicKey,
                    poolMint,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY
                }
            }
        );
        console.log("tx id: ", tx);
        console.log("poolMint.authority: ", staking_pool_imprint.toString());
    } catch (e) {
        console.log("Pool has been initialized");
    }


    let state = await program.state();
    await utils.log_state(state);
}

main().then(() => console.log('Success'));