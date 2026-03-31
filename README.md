# focus-tracking-platform
하드웨어 장치와 웹캠 트래킹을 활용한 집중도 분석 플랫폼


## Architecture Diagram

```mermaid
graph TD
    User["사용자"] --> CF["CloudFront"]
    CF --> S3FE["S3 (정적 프론트엔드)"]
    User --> IGW["Internet Gateway"]

    subgraph "AWS Cloud (VPC)"
        IGW --> ALB["Application Load Balancer"]

        subgraph "Public Subnet (Multi-AZ)"
            ALB
            NAT["NAT Gateway"]
        end

        subgraph "Private App Subnet (Multi-AZ)"
            EC2APP["EC2 App Server (Docker Container)"]
            KDS["Kinesis Data Streams"]
            KDA["Kinesis Data Analytics"]
        end

        subgraph "Private DB Subnet (Multi-AZ)"
            EC2DB["EC2 DB Server"]
        end

        ALB --> EC2APP
        EC2APP --> EC2DB
        EC2APP --> NAT

        KDS --> KDA
        KDA --> S3DATA["S3 (Raw / Processed Data)"]
        EC2APP --> KDS
    end

    NAT --> API1["아이폰 앱 API"]
    NAT --> API2["애플워치 앱 API"]
    NAT --> API3["웹캠 API"]

    GitHub["GitHub Actions"] --> ECR["AWS ECR"]
    ECR --> EC2APP

    Dev["Developer / CI-CD"] --> TF["Terraform"]
    TF --> S3STATE["S3 (Terraform State)"]
    TF --> DDBLOCK["DynamoDB (State Lock)"]
    TF --> AWSRES["AWS Infrastructure Provisioning"]

    AWSRES --> ALB
    AWSRES --> EC2APP
    AWSRES --> EC2DB
    AWSRES --> NAT
    AWSRES --> S3FE
    AWSRES --> CF
    AWSRES --> KDS
    AWSRES --> KDA
    AWSRES --> S3DATA
