#!/bin/bash
source /home/ubuntu/.profile

export NODE_ENV=production

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

sudo chown -R ubuntu:www-data /var/www
# sudo service nginx restart
# cd /var/www/node/a2z-insurance/newrelease/

echo >> /home/ubuntu/insurance-deployprocess.txt
echo 'npm' >> /home/ubuntu/insurance-deployprocess.txt
npm -v >> /home/ubuntu/insurance-deployprocess.txt
echo "node" >> /home/ubuntu/insurance-deployprocess.txt
node -v >> /home/ubuntu/insurance-deployprocess.txt
echo $(whoami) >> /home/ubuntu/insurance-deployprocess.txt
echo "UID: $UID" >> /home/ubuntu/insurance-deployprocess.txt
echo " 4. Start server " >> /home/ubuntu/insurance-deployprocess.txt


# rm -r /var/www/node/a2z-insurance/current/.next
cp -r /var/www/node/a2z-insurance/newrelease/. /var/www/node/a2z-insurance/current/

rm -r /var/www/node/a2z-insurance/newrelease
mkdir -p /var/www/node/a2z-insurance/newrelease

cd /var/www/node/a2z-insurance/current/

echo "pm2:1" >> /home/ubuntu/insurance-deployprocess.txt
pm2 restart process.json -i 0 >> /home/ubuntu/insurance-deployprocess.txt
echo "pm2:finish" >> /home/ubuntu/insurance-deployprocess.txt
