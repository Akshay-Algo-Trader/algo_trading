#!/bin/bash

# AlgoTrader Project Setup Script

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                     AlgoTrader Setup Script                               ║"
echo "║                     Algorithmic Trading Platform                          ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠ Docker is not installed. Please install Docker first.${NC}"
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${BLUE}✓ Docker and Docker Compose found${NC}"
echo ""

# Setup backend .env
echo -e "${BLUE}Setting up backend environment...${NC}"
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo -e "${GREEN}✓ Created backend/.env${NC}"
else
    echo -e "${YELLOW}! backend/.env already exists${NC}"
fi

# Setup frontend .env
echo -e "${BLUE}Setting up frontend environment...${NC}"
if [ ! -f "frontend/.env" ]; then
    cp frontend/.env.example frontend/.env
    echo -e "${GREEN}✓ Created frontend/.env${NC}"
else
    echo -e "${YELLOW}! frontend/.env already exists${NC}"
fi

echo ""
echo -e "${BLUE}Starting services...${NC}"
docker-compose up -d

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                     Setup Complete!                                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Services are starting. Please wait 30-60 seconds for them to be ready.${NC}"
echo ""
echo "Access points:"
echo -e "  ${BLUE}Frontend${NC}:  http://localhost:5173"
echo -e "  ${BLUE}Backend${NC}:   http://localhost:5000"
echo -e "  ${BLUE}Database${NC}:  localhost:3306 (user: algotrader, pass: algotrader)"
echo ""
echo "Useful commands:"
echo -e "  ${BLUE}View logs${NC}:        docker-compose logs -f"
echo -e "  ${BLUE}Stop services${NC}:    docker-compose down"
echo -e "  ${BLUE}Rebuild services${NC}: docker-compose build"
echo ""
echo "Configuration files to update:"
echo -e "  ${BLUE}Backend config${NC}:  backend/.env (Kite API credentials, secrets)"
echo -e "  ${BLUE}Frontend config${NC}: frontend/.env"
echo ""
