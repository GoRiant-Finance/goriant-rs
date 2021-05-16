# Goriant Rust - Solana blockchain

## Flexible staking program

### Guide to run local dev

run solana test validator local

    nohup solana-test-validator -r &

- build & deploy to local net - after run build & deploy
- it will grep programId from output and update programId in config.json

    ./deploy.sh

### Tech stack:
- anchor 0.5.0
    
    #### setup DEV ENV anchor
        
        https://project-serum.github.io/anchor/getting-started/installation.html