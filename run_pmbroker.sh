for (( ; ; ))
do
#	nodejs pmbroker.js 2>&1 | tee log/runlog_`date -u +"%Y-%m-%dT%H:%M:%SZ"`
    nodejs pmbroker.js -c pmbroker_config |tee log/livelog.`date -u +"%Y-%m-%dT%H:%M:%SZ"`
    sleep 10
done
