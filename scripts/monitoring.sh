#!/bin/bash

# AWS ECS, Task, EC2 Monitoring Script
# This script displays monitoring information for AWS resources

#!/bin/bash

set -e

AWS_PROFILE=${AWS_PROFILE:-default}
AWS_REGION=${AWS_REGION:-ap-northeast-2}
AWS_DEFAULT_REGION=$AWS_REGION
CLUSTER_NAME=${CLUSTER_NAME:?Error: CLUSTER_NAME is required}

export AWS_PROFILE
export AWS_REGION
export AWS_DEFAULT_REGION

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION=${AWS_REGION:-"us-east-1"}
CLUSTER_NAME=${CLUSTER_NAME:-"focus-tracking-platform-dev-cluster"}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AWS Monitoring Dashboard${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print section headers
print_header() {
    echo -e "${YELLOW}>>> $1${NC}"
}

# Function to check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}Error: AWS CLI is not installed${NC}"
        exit 1
    fi
}

# Function to display ECS Cluster Information
show_ecs_clusters() {
    print_header "ECS Clusters"
    aws ecs list-clusters --region "$AWS_REGION" --output table
    echo ""
}

# Function to display ECS Services
show_ecs_services() {
    print_header "ECS Services (Cluster: $CLUSTER_NAME)"
    aws ecs list-services --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --output table
    echo ""
}

# Function to display ECS Tasks
show_ecs_tasks() {
    print_header "ECS Tasks (Cluster: $CLUSTER_NAME)"
    aws ecs list-tasks --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --output table
    
    # Get detailed task information
    local tasks=$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --query 'taskArns[]' --output text)
    if [ -n "$tasks" ]; then
        echo ""
        echo -e "${YELLOW}Task Details:${NC}"
        aws ecs describe-tasks --cluster "$CLUSTER_NAME" --tasks $tasks --region "$AWS_REGION" --output table
    fi
    echo ""
}

# Function to display EC2 Instances
show_ec2_instances() {
    print_header "EC2 Instances"
    aws ec2 describe-instances --region "$AWS_REGION" \
        --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name,PrivateIpAddress,PublicIpAddress,Tags[?Key==`Name`]|[0].Value]' \
        --output table
    echo ""
}

# Function to display EC2 Metrics
show_ec2_metrics() {
    print_header "EC2 CPU Utilization (Last 10 Minutes)"
    
    local instances=$(aws ec2 describe-instances --region "$AWS_REGION" \
        --query 'Reservations[*].Instances[*].InstanceId' --output text)
    
    if [ -z "$instances" ]; then
        echo "No EC2 instances found"
        return
    fi
    
    for instance_id in $instances; do
        echo ""
        echo -e "${BLUE}Instance: $instance_id${NC}"
        aws cloudwatch get-metric-statistics \
            --namespace AWS/EC2 \
            --metric-name CPUUtilization \
            --dimensions Name=InstanceId,Value=$instance_id \
            --statistics Average \
            --start-time "$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
            --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
            --period 300 \
            --region "$AWS_REGION" \
            --output table
    done
    echo ""
}

# Function to display ECS Service Metrics
show_ecs_service_metrics() {
    print_header "ECS Service CPU/Memory (Last 10 Minutes)"
    
    local services=$(aws ecs list-services --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --query 'serviceArns[]' --output text)
    
    if [ -z "$services" ]; then
        echo "No ECS services found"
        return
    fi
    
    for service_arn in $services; do
        service_name=$(echo $service_arn | awk -F'/' '{print $NF}')
        echo ""
        echo -e "${BLUE}Service: $service_name${NC}"
        
        # CPU Utilization
        echo "CPU Utilization:"
        aws cloudwatch get-metric-statistics \
            --namespace AWS/ECS \
            --metric-name CPUUtilization \
            --dimensions Name=ServiceName,Value=$service_name Name=ClusterName,Value=$CLUSTER_NAME \
            --statistics Average \
            --start-time "$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
            --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
            --period 300 \
            --region "$AWS_REGION" \
            --output table
        
        # Memory Utilization
        echo ""
        echo "Memory Utilization:"
        aws cloudwatch get-metric-statistics \
            --namespace AWS/ECS \
            --metric-name MemoryUtilization \
            --dimensions Name=ServiceName,Value=$service_name Name=ClusterName,Value=$CLUSTER_NAME \
            --statistics Average \
            --start-time "$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
            --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
            --period 300 \
            --region "$AWS_REGION" \
            --output table
    done
    echo ""
}

# Function to display ALB Metrics
show_alb_metrics() {
    print_header "ALB Target Group Health"
    
    local target_groups=$(aws elbv2 describe-target-groups --region "$AWS_REGION" \
        --query 'TargetGroups[*].TargetGroupArn' --output text)
    
    if [ -z "$target_groups" ]; then
        echo "No target groups found"
        return
    fi
    
    for tg_arn in $target_groups; do
        tg_name=$(echo $tg_arn | awk -F':' '{print $NF}' | awk -F'/' '{print $2"-"$3}')
        echo ""
        echo -e "${BLUE}Target Group: $tg_name${NC}"
        aws elbv2 describe-target-health --target-group-arn "$tg_arn" \
            --region "$AWS_REGION" --output table
    done
    echo ""
}

# Function to display summary
show_summary() {
    print_header "Summary"
    
    local cluster_count=$(aws ecs list-clusters --region "$AWS_REGION" --query 'clusterArns' --output text | wc -w)
    local services=$(aws ecs list-services --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --query 'serviceArns' --output text)
    local service_count=$(echo "$services" | wc -w)
    local tasks=$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --region "$AWS_REGION" --query 'taskArns' --output text)
    local task_count=$(echo "$tasks" | wc -w)
    local instances=$(aws ec2 describe-instances --region "$AWS_REGION" --query 'Reservations[*].Instances[*].InstanceId' --output text)
    local instance_count=$(echo "$instances" | wc -w)
    
    echo "AWS Region: $AWS_REGION"
    echo "ECS Clusters: $cluster_count"
    echo "ECS Services: $service_count"
    echo "ECS Tasks: $task_count"
    echo "EC2 Instances: $instance_count"
    echo ""
}

# Main execution
main() {
    check_aws_cli
    
    show_summary
    show_ecs_clusters
    show_ecs_services
    show_ecs_tasks
    show_ec2_instances
    show_ec2_metrics
    show_ecs_service_metrics
    show_alb_metrics
    
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Monitoring Complete${NC}"
    echo -e "${GREEN}========================================${NC}"
}

# Run main function
main
