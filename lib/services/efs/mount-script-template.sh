#!/bin/bash

yum install -y nfs-utils

echo "Mounting EFS filesystem {{EFS_FILE_SYSTEM_ID}} to directory {{EFS_MOUNT_DIR}} ..."

echo 'Checking if EFS mount directory exists...'
if [ ! -d {{EFS_MOUNT_DIR}} ]; then
    echo "Creating directory {{EFS_MOUNT_DIR}} ..."
    mkdir -p {{EFS_MOUNT_DIR}}
    if [ $? -ne 0 ]; then
        echo 'ERROR: Directory creation failed!'
        exit 1
    fi
    chmod 777 {{EFS_MOUNT_DIR}}
    if [ $? -ne 0 ]; then
        echo 'ERROR: Permission update failed!'
        exit 1
    fi
else
    echo "Directory {{EFS_MOUNT_DIR}} already exists!"
fi

mountpoint -q {{EFS_MOUNT_DIR}}
if [ $? -ne 0 ]; then
    echo "mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 {{EFS_FILE_SYSTEM_ID}}.efs.{{EFS_REGION}}.amazonaws.com:/ {{EFS_MOUNT_DIR}}"
    mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2 {{EFS_FILE_SYSTEM_ID}}.efs.{{EFS_REGION}}.amazonaws.com:/ {{EFS_MOUNT_DIR}}
    if [ $? -ne 0 ] ; then
        echo 'ERROR: Mount command failed!'
        exit 1
    fi
else
    echo "Directory {{EFS_MOUNT_DIR}} is already a valid mountpoint!"
fi

echo 'EFS mount complete.'