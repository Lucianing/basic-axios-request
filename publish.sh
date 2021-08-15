#!/bin/bash

clear &&

echo '开始发布'

yarn install &&

yarn build &&

echo '切换源' &&

nrm use basic-npm &&

echo '开始上传包' &&

npm publish &&

echo '发布成功' &&

nrm use zwgroup

#git pull &&
#
#git add . &&
#
#git commit -m "feat: 组件开发" &&
#
#git push
