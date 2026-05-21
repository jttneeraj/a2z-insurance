#!/bin/sh
set -e

# Create log directories if they don't exist (including typos in code)
mkdir -p \
    logs/combined logs/combibned logs/error logs/sms \
    logs/services/levin logs/services/axis logs/services/airtel \
    logs/services/icici logs/services/sbi logs/services/fino \
    logs/services/fingpay logs/services/payu logs/services/razorpay \
    logs/services/cashfree logs/services/casfree logs/services/yesbank logs/services/canara \
    logs/services/instantpay logs/services/instapay logs/services/ncash \
    logs/services/paypointppi logs/services/quick-ekyc logs/services/sure-pass \
    logs/services/zwitch logs/services/indo-nepal logs/services/insurance \
    logs/services/hive logs/services/iserveu logs/services/payone \
    logs/services/redpay logs/services/savshka logs/services/agpl \
    logs/services/icore logs/services/mrobotic logs/services/digikhata \
    logs/services/hdfc logs/services/kotak logs/services/bob \
    logs/services/pnb logs/services/idfc logs/services/federal \
    logs/services/indusind logs/services/rbl logs/services/dcb \
    logs/services/bandhan logs/services/idbi logs/services/au \
    logs/services/ujjivan logs/services/equitas logs/services/suryoday

exec "$@"
