#!/bin/bash
source /home/ubuntu/.profile


sudo chown -R ubuntu:www-data /var/www
# mkdir /var/www/node/a2z-insurance/newrelease/shared
sudo chmod -R 777 /var/www/node/a2z-insurance/newrelease/scripts

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion


echo >> /home/ubuntu/insurance-deployprocess.txt
echo $(whoami) $DEPLOYMENT_GROUP_NAME >> /home/ubuntu/insurance-deployprocess.txt
echo $HOME >> /home/ubuntu/insurance-deployprocess.txt
echo "UID: $UID" >> /home/ubuntu/insurance-deployprocess.txt
echo $(whoami) >> /home/ubuntu/insurance-deployprocess.txt
echo " 2. Change permission " >> /home/ubuntu/insurance-deployprocess.txt


# TO SETUP CONFIG DYANMICALLY.
# rm -r /var/www/node/a2z-insurance/newrelease/.env
# aws s3 cp s3://palo-server-config/node/a2z-insurance/prod/config.json /var/www/node/a2z-insurance/newrelease/config/
aws s3 cp s3://a2zsuvidhaa/a2z-config/dev/a2z-insurance/.env /var/www/node/a2z-insurance/newrelease/
echo " 2.1 Setup app: Copied required files to required locations $DEPLOYMENT_GROUP_NAME" >> /home/ubuntu/insurance-deployprocess.txt


echo >> /home/ubuntu/.profile
echo export NODE_ENV=production >> /home/ubuntu/.profile

cd /var/www/node/a2z-insurance/newrelease/

echo "npm:install:start" >> /home/ubuntu/insurance-deployprocess.txt

# sed -i '/"shared-library"/d' package.json
# rm -rf node_modules/shared-library
npm uninstall shared-library >> /home/ubuntu/insurance-deployprocess.txt
npm install >> /home/ubuntu/insurance-deployprocess.txt

# aws s3 sync s3://your-s3-bucket/path/to/code /path/to/local/folder
# aws s3 sync s3://a2zsuvidhaa/a2z-shared-library-dev /var/www/node/a2z-insurance/shared-library
rm /var/www/node/a2z-insurance/shared-library/*
aws s3 cp s3://a2zsuvidhaa/a2z-shared-library-dev/shared-library.zip /var/www/node/a2z-insurance/shared-library

cd /var/www/node/a2z-insurance/shared-library
## sudo apt-get install unzip
unzip -o shared-library.zip -d . 
npm pack
## shared-library-1.0.0.tgz
cd /var/www/node/a2z-insurance/newrelease/
npm install /var/www/node/a2z-insurance/shared-library/*.tgz

cd /var/www/node/a2z-insurance/current
# sed -i '/"shared-library"/d' package.json
# rm -rf node_modules/shared-library
npm uninstall shared-library
npm install /var/www/node/a2z-insurance/shared-library/*.tgz

echo "npm:install:finished" >> /home/ubuntu/insurance-deployprocess.txt
