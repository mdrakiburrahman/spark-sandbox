# Contributing

## How to use, on a Windows machine by installing WSL

1. Windows pre-reqs

   ```powershell
   winget install -e --id Microsoft.VisualStudioCode
   ```

1. Get a fresh new WSL machine up:

   > ⚠️ Warning: this removes Docker Desktop if you have it installed

   ```powershell
   $GIT_ROOT = git rev-parse --show-toplevel
   & "$GIT_ROOT\contrib\bootstrap-dev-env.ps1"
   ```

1. Clone the repo, and open VSCode in it:

    > ⚠️ Important: We use WSL in `~/` because Linux > Windows drive commits via `/mnt/c` is extremely slow for Spark I/O.
    > You can technically run the Devcontainer using Windows Docker Desktop, but the I/O experience is slow and poor.

   ```bash
   cd /workspaces

   read -p "Enter your name (e.g. 'FirstName LastName'): " user_name
   read -p "Enter your GitHub email (e.g. 'your-email@blah.com'): " user_email
   read -p "Enter the branch to switch to: (e.g. 'main') " branch_name
    
   git clone https://github.com/mdrakiburrahman/spark-sandbox.git

   git config --global user.name "$user_name"
   git config --global user.email "$user_email"
   cd /workspaces/spark-sandbox/
   git pull origin
   git checkout -b "$branch_name"
   code .
   ```

1. Run the bootstrapper script, that installs all tools idempotently:

   ```bash
   GIT_ROOT=$(git rev-parse --show-toplevel)
   chmod +x ${GIT_ROOT}/contrib/bootstrap-dev-env.sh && ${GIT_ROOT}/contrib/bootstrap-dev-env.sh
   ```

1. Launch devcontainer:

   ```bash
   cd /workspaces/spark-sandbox
   HEX=$(printf '%s' "$(wslpath -w .)" | xxd -ps -c 256)
   code --folder-uri "vscode-remote://dev-container+${HEX}/workspaces/spark-sandbox"
   ```