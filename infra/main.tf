terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# --- Variables ---

variable "aws_region" {
  default = "ap-southeast-1"
}

variable "instance_type" {
  default = "t3.small"
}

variable "key_name" {
  description = "AWS SSH key pair name (create one in EC2 console if you don't have one)"
  type        = string
}

variable "app_env" {
  description = "Environment variables for the app (paste from .env.local)"
  type        = map(string)
  default     = {}
  sensitive   = true
}

# --- Data ---

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# --- Security Group ---

resource "aws_security_group" "stayjoy" {
  name        = "stayjoy-test-sg"
  description = "StayJoy test - allow HTTP, HTTPS, SSH, n8n, Chatwoot"

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Next.js dashboard
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Chatwoot
  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # n8n
  ingress {
    from_port   = 5678
    to_port     = 5678
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP (for Let's Encrypt later)
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "stayjoy-test"
  }
}

# --- EC2 Instance ---

resource "aws_instance" "stayjoy" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.stayjoy.id]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user_data.sh", {
    docker_compose_content = file("${path.module}/docker-compose.yml")
    dockerfile_content     = file("${path.module}/Dockerfile")
    env_content            = join("\n", [for k, v in var.app_env : "${k}=${v}"])
  })

  tags = {
    Name = "stayjoy-test"
  }
}

# --- Elastic IP (so IP doesn't change on restart) ---

resource "aws_eip" "stayjoy" {
  instance = aws_instance.stayjoy.id
  domain   = "vpc"

  tags = {
    Name = "stayjoy-test"
  }
}

# --- Outputs ---

output "public_ip" {
  value = aws_eip.stayjoy.public_ip
}

output "dashboard_url" {
  value = "http://${aws_eip.stayjoy.public_ip}:3000"
}

output "n8n_url" {
  value = "http://${aws_eip.stayjoy.public_ip}:5678"
}

output "chatwoot_url" {
  value = "http://${aws_eip.stayjoy.public_ip}:3001"
}

output "ssh_command" {
  value = "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${aws_eip.stayjoy.public_ip}"
}
