# CS 554 — One Service, Two Deployment Environments

Deepkumar G. Patel

**Recorded walkthrough:** https://youtu.be/qY1sLpMCTcI


## Prerequisites and environment

My Windows project folder is `C:\Users\deepp\Downloads\midterm`. I run Docker Compose inside an Ubuntu Server 24.04 VirtualBox VM named `CS554-Midterm`, with hostname `midterm-vm`, 2 virtual CPUs, 4 GB RAM, and a 25 GB virtual disk. The VM has Docker Engine and the Docker Compose plugin installed, with SSH enabled. My Linux project folder is `/home/deep990/midterm`.

I run Kubernetes separately with kind on Windows through Docker Desktop's Linux container environment. It does not run inside the VirtualBox VM. The cluster is named `midterm`, the kubectl context is `kind-midterm`, and its single node is `midterm-control-plane`. For this project, I used VirtualBox, Ubuntu Server, Docker Engine, Docker Compose, Docker Desktop, kind, kubectl, Windows PowerShell, OpenSSH/scp, and curl. My local kind executable is `$env:USERPROFILE\tools\kind.exe`. Docker Desktop must be running for kind operations.

The service runs on Node.js 22 inside the container, so I do not need Node installed on Windows. The application has no external npm dependencies. GET `/` returns a configured service name/message, hostname, and process-local request counter. Only GET `/` increments the counter. GET `/health` normally returns HTTP 200 with `{"status":"ok"}`. For the graduate experiment, a file at `/tmp/not-ready` changes only `/health` to HTTP 503. Removing the file restores HTTP 200. The application writes request and startup information to standard output.

### Manual VM networking setup

The VM uses VirtualBox NAT. In my setup, the guest interface is `enp0s3`, with address `10.0.2.15` and gateway `10.0.2.2`. Configure these TCP port-forwarding rules in VirtualBox:

| Purpose | Host address/port | Guest port |
|---|---|---|
| SSH | 127.0.0.1:2222 | 22 |
| Application | 127.0.0.1:8080 | 8080 |

For my installation, I configured the guest DNS through `/etc/netplan/99-dns.yaml` with nameservers `1.1.1.1` and `8.8.8.8`, and DHCP DNS disabled for `enp0s3`. Apply the configuration with `sudo netplan apply`; the YAML file should have permissions 600. I made this change to fix a local network problem; the application itself does not depend on it.

### Build and test on Windows

Run these commands in Windows PowerShell from the project root:

```powershell
cd "$env:USERPROFILE\Downloads\midterm"
docker build -t cs554-midterm:1.1 .
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/app" -w /app cs554-midterm:1.1 npm test
```

The supplied test passed, with one test and no failures. It checks the configured response, counter, normal health response, and a fresh server instance. I checked the new readiness toggle separately in the manual Kubernetes experiment.

### Transfer the same image to the Linux VM

I built version 1.1 once on Windows, loaded it into kind, and exported it for the VM. I did not rebuild it inside the VM. The archive is only used to transfer the image and stays outside the project folder. It must not be committed or submitted.

```powershell
docker save -o "$env:USERPROFILE\Downloads\cs554-midterm-1.1.tar" cs554-midterm:1.1
scp -P 2222 "$env:USERPROFILE\Downloads\cs554-midterm-1.1.tar" deep990@127.0.0.1:/home/deep990/
scp -P 2222 .\compose.yaml deep990@127.0.0.1:/home/deep990/midterm/
scp -P 2222 .\src\server.js deep990@127.0.0.1:/home/deep990/midterm/src/
ssh -p 2222 deep990@127.0.0.1
```

For the first setup, copy the complete project, including its source and configuration files, into `/home/deep990/midterm` before these update commands. Enter the VM account password when prompted. Never include it in documentation or scripts.

Inside the Linux SSH session:

```bash
sudo docker load -i /home/deep990/cs554-midterm-1.1.tar
cd /home/deep990/midterm
sudo docker compose up -d --no-build
sudo docker compose ps
curl -i http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/health
sudo docker compose logs --tail=10 app
```

Compose sets PORT=8080, SERVICE_NAME=cs554-midterm, and MESSAGE="Hello from Deepkumar's Linux VM". It publishes guest port 8080 to container port 8080. The Dockerfile uses `node:22-alpine` and runs as the unprivileged `node` user.

Open a separate Windows PowerShell tab and check access from the host:

```powershell
curl.exe -i http://127.0.0.1:8080/
curl.exe -i http://127.0.0.1:8080/health
```

To check what happens to the counter after a restart, run these commands inside the VM:

```bash
curl -s http://127.0.0.1:8080/
sudo docker compose restart app
# Allow startup to finish before the next request.
curl -s http://127.0.0.1:8080/
```

### Kubernetes startup and access

For a new setup, create the cluster once. Skip this step if the `midterm` cluster already exists.

```powershell
& "$env:USERPROFILE\tools\kind.exe" create cluster --name midterm --wait 5m
& "$env:USERPROFILE\tools\kind.exe" load docker-image cs554-midterm:1.1 --name midterm
kubectl --context kind-midterm apply -f .\k8s\app.yaml
kubectl --context kind-midterm rollout status deployment/midterm-app --timeout=120s
kubectl --context kind-midterm get deployment,pods,service
kubectl --context kind-midterm get pods -o wide
```

The manifest specifies two replicas and uses imagePullPolicy Never, so the image must be loaded explicitly using the command above. The Service selects `app=midterm-app` and maps Service port 80 to application port 8080. Kubernetes changes MESSAGE to "Hello from Deepkumar's Kubernetes cluster" without changing the image.

To access the service from the host, leave this command running in one Windows tab:

```powershell
kubectl --context kind-midterm port-forward service/midterm-service 8081:80
```

Use another Windows tab:

```powershell
curl.exe -i http://127.0.0.1:8081/
curl.exe -i http://127.0.0.1:8081/health
```

Port forwarding shows that I can access a selected application Pod locally. It does not show balanced routing or whether all replicas are eligible for traffic. Stop it with Ctrl+C before troubleshooting. The experiments below use the Service DNS name from inside the cluster, so the requests depend on the Service backends.

### Pod replacement experiment

```powershell
kubectl --context kind-midterm get pods -o wide
$podToDelete = kubectl --context kind-midterm get pods -l app=midterm-app -o jsonpath='{.items[0].metadata.name}'
kubectl --context kind-midterm delete pod $podToDelete
kubectl --context kind-midterm rollout status deployment/midterm-app --timeout=120s
kubectl --context kind-midterm get pods -o wide
```

Compare the Pod names and ages before and after deletion. I first ran this experiment with version 1.0. The final deployment uses version 1.1, which includes the HTTP readiness toggle. Label the older evidence with its version.

### Selector failure and recovery

First, capture the working baseline:

```powershell
kubectl --context kind-midterm get pods --show-labels
kubectl --context kind-midterm describe service midterm-service
kubectl --context kind-midterm exec deployment/midterm-app -- wget -T 5 -qO- http://midterm-service/
```

Change the selector to introduce the failure, inspect the results, and then restore it:

```powershell
kubectl --context kind-midterm set selector service/midterm-service app=wrong-app
kubectl --context kind-midterm get pods --show-labels
kubectl --context kind-midterm describe service midterm-service
kubectl --context kind-midterm exec deployment/midterm-app -- wget -T 5 -qO- http://midterm-service/
kubectl --context kind-midterm set selector service/midterm-service app=midterm-app
kubectl --context kind-midterm describe service midterm-service
kubectl --context kind-midterm exec deployment/midterm-app -- wget -T 5 -qO- http://midterm-service/
```

The wget request is expected to fail. Save the failure evidence before restoring the selector. I first ran this experiment with version 1.0 and repeated it on the final version 1.1 deployment. Both versions use the same selector and Service port mapping.

### HTTP readiness experiment

Start by selecting one current Pod and recording both ready Pods and their endpoints:

```powershell
$readinessPod = kubectl --context kind-midterm get pods -l app=midterm-app -o jsonpath='{.items[0].metadata.name}'
kubectl --context kind-midterm get pods -o wide
kubectl --context kind-midterm get endpointslices -l kubernetes.io/service-name=midterm-service -o yaml
kubectl --context kind-midterm exec $readinessPod -- wget -S -O- http://127.0.0.1:8080/health
```

Turn off readiness for this Pod only:

```powershell
kubectl --context kind-midterm exec $readinessPod -- touch /tmp/not-ready
Start-Sleep -Seconds 6
kubectl --context kind-midterm get pods -o wide
kubectl --context kind-midterm exec $readinessPod -- wget -S -O- http://127.0.0.1:8080/health
kubectl --context kind-midterm exec $readinessPod -- wget -qO- http://127.0.0.1:8080/
```

The `/health` request should return 503, with wget exiting with code 1. The direct request to `/` should still succeed, showing that the process remains responsive. Use the following commands to display endpoint conditions without relying on Windows JSONPath quoting:

```powershell
$slices = kubectl --context kind-midterm get endpointslices -l kubernetes.io/service-name=midterm-service -o json | ConvertFrom-Json
$slices.items.endpoints | ForEach-Object {
    Write-Host "$($_.targetRef.name) ready=$($_.conditions.ready)"
}
1..5 | ForEach-Object {
    kubectl --context kind-midterm exec $readinessPod -- wget -T 5 -qO- http://midterm-service/
    Write-Host ""
}
```

Restore readiness and record the recovery:

```powershell
kubectl --context kind-midterm exec $readinessPod -- rm -f /tmp/not-ready
kubectl --context kind-midterm wait --for=condition=Ready pod/$readinessPod --timeout=60s
kubectl --context kind-midterm get pods -o wide
kubectl --context kind-midterm exec $readinessPod -- wget -S -O- http://127.0.0.1:8080/health
$slices = kubectl --context kind-midterm get endpointslices -l kubernetes.io/service-name=midterm-service -o json | ConvertFrom-Json
$slices.items.endpoints | ForEach-Object {
    Write-Host "$($_.targetRef.name) ready=$($_.conditions.ready)"
}
```

### Cleanup

When finished with Compose, run this command block inside the VM:

```bash
cd /home/deep990/midterm
sudo docker compose down
```

Run the following commands in Windows PowerShell only after collecting the evidence and recording the walkthrough. Deleting the cluster also removes its workloads.

```powershell
kubectl --context kind-midterm delete -f .\k8s\app.yaml
& "$env:USERPROFILE\tools\kind.exe" delete cluster --name midterm
```

Stop any port-forward with Ctrl+C. Shut down the guest cleanly with `sudo shutdown -h now`.
