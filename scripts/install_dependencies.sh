#!/bin/bash
source /home/ubuntu/.profile

# NGINX SERVER
# sudo apt-get update -y
# sudo apt-get install nginx -y

# sudo rm -r /var/www/html/* 2> /dev/null
# sudo mkdir -p /var/www/node/a2z-insurance/newrelease/
# sudo mkdir -p /var/www/node/a2z-insurance/shared-library/
# sudo rm -r /var/www/node/a2z-insurance/newrelease/* 2> /dev/null

sudo chown -R ubuntu:www-data /var/www


sudo echo " Deployment start: " >> /home/ubuntu/insurance-deployprocess.txt
sudo echo >> /home/ubuntu/insurance-deployprocess.txt
sudo echo $(whoami) >> /home/ubuntu/insurance-deployprocess.txt
sudo echo "UID: $UID" >> /home/ubuntu/insurance-deployprocess.txt
sudo echo " 1. Install dependencies " >> /home/ubuntu/insurance-deployprocess.txt


sudo apt-get update
