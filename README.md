# Goriant Rust - Solana Blockchain

### Flexible staking program and pending reward calculation real time

## Solana Programs

    1. Staking program is flexible, real time calculation apply dynamic program with accurate token per share technique
    
    2. ICO program is simple Airdrop program aims to support new client onboard

## Tech stack:
- anchor 0.6.0
- mocha
- chaijs


### Guide

- build & deploy to local net

```  
    anchor build && anchor deploy    
```

- run integration tests

```
    anchor test
```

### Guide run full flow

```
- run standalone Staking program sequence/flow at [Staking Sequence](standalone_client_js/staking_sequence)

- run standalone ICO program sequence/flow at [Staking Sequence](standalone_client_js/ico_sequence)

    1. deploy programs (maybe localnet) with command
        $ anchor build && anchor deploy
    
    2. get programId and update to 
        standalone_client_js/staking_sequence/config.json for Staking Program
        standalone_client_js/ico_sequence/config.json for ICO Program
    
    3. issue new Token with command
        $ ./issue_new_token_and_mint_10m.sh
        
    4. update token & vault to config.json files
    
    5. resolve Node dependencies
        $ npm i
    
    6. then run step by step example
        $ cd standalone_client_js/staking_sequence/ && node 1_init_staking_pool.js
```

#### setup DEV ENV anchor
        
        https://project-serum.github.io/anchor/getting-started/installation.html