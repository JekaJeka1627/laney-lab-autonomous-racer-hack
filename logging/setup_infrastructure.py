import boto3

# --- CONFIGURATION ---
LOG_GROUP_NAME = "deepracer-logs"
SNS_TOPIC_NAME = "DeepRacer-Alerts"
EMAIL_ADDRESS = "btranmath@gmail.com"  # Change this!
METRIC_NAME = "ErrorCount"
NAMESPACE = "DeepRacer/Simulation"

def setup_cloudwatch_alerts():
    logs = boto3.client('logs')
    cloudwatch = boto3.client('cloudwatch')
    sns = boto3.client('sns')

    # 1. Create SNS Topic & Subscription
    print(f"Creating SNS Topic: {SNS_TOPIC_NAME}...")
    topic = sns.create_topic(Name=SNS_TOPIC_NAME)
    topic_arn = topic['TopicArn']
    
    sns.subscribe(
        TopicArn=topic_arn,
        Protocol='email',
        Endpoint=EMAIL_ADDRESS
    )
    print(f"Check your email ({EMAIL_ADDRESS}) to confirm the subscription!")

    # 2. Create Metric Filter
    # This scans logs for the word "ERROR" and turns them into a numeric metric
    print(f"Creating Metric Filter on {LOG_GROUP_NAME}...")
    logs.put_metric_filter(
        logGroupName=LOG_GROUP_NAME,
        filterName="ErrorFilter",
        filterPattern='"ERROR"', # Matches the literal string ERROR
        metricTransformations=[
            {
                'metricName': METRIC_NAME,
                'metricNamespace': NAMESPACE,
                'metricValue': '1'  # Increment by 1 for every match
            }
        ]
    )

    # 3. Create CloudWatch Alarm
    print("Creating CloudWatch Alarm...")
    cloudwatch.put_metric_alarm(
        AlarmName="DeepRacer-Failure-Alarm",
        ComparisonOperator='GreaterThanThreshold',
        EvaluationPeriods=1,
        MetricName=METRIC_NAME,
        Namespace=NAMESPACE,
        Period=60, # Check every 60 seconds
        Statistic='Sum',
        Threshold=0.0,
        ActionsEnabled=True,
        AlarmActions=[topic_arn],
        AlarmDescription="Triggered when 'ERROR' is found in simulation logs"
    )
    print("✅ Alerting infrastructure is ready.")

if __name__ == "__main__":
    setup_cloudwatch_alerts()
