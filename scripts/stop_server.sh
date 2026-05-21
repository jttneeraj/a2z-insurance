#!/bin/bash
source /home/ubuntu/.profile

isExistApp=`pgrep nginx`
if [[ -n  $isExistApp ]]; then
    # export NVM_DIR="$HOME/.nvm"
    # [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    # [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
    # sudo service nginx stop
    # pm2 stop a2z-insurance
    # pm2 stop a2z-insurance
    sudo echo "Stop App Section: We will not stop any server to reduce server downtime." >> /home/ubuntu/insurance-deployprocess.txt
fi

sudo echo >> /home/ubuntu/insurance-deployprocess.txt
sudo echo $(whoami) >> /home/ubuntu/insurance-deployprocess.txt
sudo echo "UID: $UID" >> /home/ubuntu/insurance-deployprocess.txt
sudo echo " 5. Stop server " >> /home/ubuntu/insurance-deployprocess.txt
