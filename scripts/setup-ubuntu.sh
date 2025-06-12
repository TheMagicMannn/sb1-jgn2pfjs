#!/bin/bash

# BSC Arbitrage Bot - Ubuntu 24 Setup Script
# This script sets up the development environment for the arbitrage bot

set -e

echo "🚀 Setting up BSC Arbitrage Bot on Ubuntu 24..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root"
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
print_status "Installing essential packages..."
sudo apt install -y curl wget git build-essential software-properties-common

# Install Node.js 20 LTS
print_status "Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_status "Node.js version: $NODE_VERSION"
print_status "npm version: $NPM_VERSION"

# Install Yarn (optional but recommended)
print_status "Installing Yarn package manager..."
npm install -g yarn

# Install PM2 for process management
print_status "Installing PM2 for process management..."
npm install -g pm2

# Install global development tools
print_status "Installing global development tools..."
npm install -g hardhat-shorthand

# Create project directory structure
print_status "Setting up project directory structure..."
mkdir -p ~/arbitrage-bot/{logs,backups,deployments}

# Set up environment variables template
print_status "Creating environment configuration..."
cat > ~/arbitrage-bot/.env.production << EOF
# Production Environment Configuration
NODE_ENV=production

# BSC Network Configuration
BSC_RPC_URL=https://bsc-dataseed1.binance.org/
CHAIN_ID=56

# Wallet Configuration (NEVER commit real private keys)
PRIVATE_KEY=

# Smart Contract Address (set after deployment)
CONTRACT_ADDRESS=

# Bot Parameters
MIN_PROFIT_PERCENT=0.5
MAX_GAS_PRICE=20
FLASH_LOAN_AMOUNT=10

# Advanced Configuration
SCAN_INTERVAL=2000
MAX_CONCURRENT_SCANS=10
CACHE_TIMEOUT=5000

# Logging Configuration
LOG_LEVEL=info
LOG_TO_FILE=true

# Safety Limits
MAX_SLIPPAGE=0.5
MIN_LIQUIDITY=50000
MAX_PRICE_IMPACT=2.0

# BSCScan API Key for contract verification
BSCSCAN_API_KEY=

# Monitoring & Alerts
WEBHOOK_URL=
ALERT_ON_PROFIT=true
ALERT_ON_ERROR=true
EOF

# Set up PM2 ecosystem file
print_status "Creating PM2 ecosystem configuration..."
cat > ~/arbitrage-bot/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'bsc-arbitrage-bot',
    script: 'src/bot/arbitrageBot.js',
    cwd: '/home/$(whoami)/arbitrage-bot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Set up log rotation
print_status "Setting up log rotation..."
sudo tee /etc/logrotate.d/arbitrage-bot > /dev/null << EOF
/home/$(whoami)/arbitrage-bot/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $(whoami) $(whoami)
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Install and configure UFW firewall
print_status "Configuring firewall..."
sudo ufw --force enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000/tcp  # For web interface
print_status "Firewall configured with basic rules"

# Set up system monitoring
print_status "Installing system monitoring tools..."
sudo apt install -y htop iotop nethogs

# Create backup script
print_status "Creating backup script..."
cat > ~/arbitrage-bot/backup.sh << 'EOF'
#!/bin/bash

# Backup script for BSC Arbitrage Bot
BACKUP_DIR="$HOME/arbitrage-bot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="arbitrage-bot-backup-$DATE.tar.gz"

echo "Creating backup: $BACKUP_FILE"

# Create backup
tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
    --exclude="node_modules" \
    --exclude="cache" \
    --exclude="artifacts" \
    --exclude="logs/*.log" \
    -C "$HOME" arbitrage-bot/

echo "Backup created: $BACKUP_DIR/$BACKUP_FILE"

# Keep only last 7 backups
cd "$BACKUP_DIR"
ls -t arbitrage-bot-backup-*.tar.gz | tail -n +8 | xargs -r rm

echo "Backup cleanup completed"
EOF

chmod +x ~/arbitrage-bot/backup.sh

# Set up cron job for daily backups
print_status "Setting up automated backups..."
(crontab -l 2>/dev/null; echo "0 2 * * * $HOME/arbitrage-bot/backup.sh >> $HOME/arbitrage-bot/logs/backup.log 2>&1") | crontab -

# Install security updates automatically
print_status "Configuring automatic security updates..."
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Set up fail2ban for additional security
print_status "Installing fail2ban for security..."
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create systemd service as alternative to PM2
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/arbitrage-bot.service > /dev/null << EOF
[Unit]
Description=BSC Arbitrage Bot
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)/arbitrage-bot
ExecStart=/usr/bin/node src/bot/arbitrageBot.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=append:/home/$(whoami)/arbitrage-bot/logs/systemd.log
StandardError=append:/home/$(whoami)/arbitrage-bot/logs/systemd-error.log

[Install]
WantedBy=multi-user.target
EOF

# Set proper permissions
print_status "Setting up permissions..."
chmod 600 ~/arbitrage-bot/.env.production
chmod 755 ~/arbitrage-bot/
chmod -R 755 ~/arbitrage-bot/logs/
chmod -R 755 ~/arbitrage-bot/backups/

# Install additional useful tools
print_status "Installing additional development tools..."
sudo apt install -y jq tree ncdu

print_status "✅ Ubuntu 24 setup completed successfully!"
echo ""
print_status "📋 Next Steps:"
echo "1. Clone your arbitrage bot repository to ~/arbitrage-bot/"
echo "2. Run 'npm install' to install dependencies"
echo "3. Configure your .env.production file with real values"
echo "4. Deploy the smart contract: npm run deploy:mainnet"
echo "5. Start the bot: pm2 start ecosystem.config.js"
echo ""
print_status "🔧 Useful Commands:"
echo "- Monitor bot: pm2 monit"
echo "- View logs: pm2 logs bsc-arbitrage-bot"
echo "- Restart bot: pm2 restart bsc-arbitrage-bot"
echo "- System status: htop"
echo "- Create backup: ~/arbitrage-bot/backup.sh"
echo ""
print_warning "⚠️  Security Reminders:"
echo "- Never commit private keys to version control"
echo "- Use strong passwords and SSH keys"
echo "- Regularly update system packages"
echo "- Monitor logs for suspicious activity"
echo "- Test thoroughly on testnet first"
echo ""
print_status "🎉 Setup complete! Happy arbitraging!"
EOF

chmod +x scripts/setup-ubuntu.sh