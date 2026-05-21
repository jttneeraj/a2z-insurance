#!/bin/bash

# sudo mkdir /var/www/node/a2z-insurance/shared
sudo chown -R ubuntu:www-data /var/www
sudo chmod -R 777 /var/www/node/a2z-insurance/scripts

sudo echo >> /home/ubuntu/insurance-deployprocess.txt
sudo echo " 2. Change permission " >> /home/ubuntu/insurance-deployprocess.txt