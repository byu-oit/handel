set -eux
cd /home/ec2-user

echo "Installing Java"
yum install -y java-1.8.0-devel
alternatives --set java /usr/lib/jvm/jre-1.8.0-openjdk.x86_64/bin/java

echo 'Installing Gremlin Console'
TINKERPOP_VERSION="3.3.2"
TINKERPOP_DIR="apache-tinkerpop-gremlin-console-${TINKERPOP_VERSION}"
TINKERPOP_ZIP="${TINKERPOP_DIR}-bin.zip"
wget https://archive.apache.org/dist/tinkerpop/${TINKERPOP_VERSION}/$TINKERPOP_ZIP
unzip $TINKERPOP_ZIP
rm $TINKERPOP_ZIP

echo "Configuring Neptune remote"
cat >"${TINKERPOP_DIR}/conf/neptune-remote.yml" <<EOL
hosts: [ $DB_CLUSTER_ENDPOINT ]
port: 8182
serializer: { className: org.apache.tinkerpop.gremlin.driver.ser.GryoMessageSerializerV3d0, config: { serializeResultToString: true }}
EOL
