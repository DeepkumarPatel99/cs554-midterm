# CS 554 — Evidence Log

This log records the results I observed during the project. The screenshots are saved separately in the `evidence` folder.

## VM and Docker Compose

| Evidence | result |
|---|---|
| VM HTTP endpoints and logs | The application inside the VM returned HTTP 200 from its endpoints and recorded the requests in its logs. |
| Windows host access | Requests from Windows reached the application inside the VM through the configured forwarded port. |
| Restart and counter reset | After I restarted the service with Compose, the root request counter changed from 3 to 1. The hostname stayed the same because the counter is stored in process memory. |

## Kubernetes deployment and Pod replacement

| Evidence | result |
|---|---|
| HTTP access through port forwarding | The earlier version 1.0 deployment responded to HTTP requests. Port forwarding by itself does not show Service load balancing. |
| Pod deletion and replacement | In the earlier version 1.0 experiment, deleting a Pod caused a replacement with a new name to appear, bringing the deployment back to two ready replicas. |
| Final deployment overview | The Deployment showed two ready replicas. Both application Pods were 1/1 Running with zero restarts, and the ClusterIP Service appeared in the output. A request through the Service succeeded. |

## Service selector failure and recovery

These screenshots show the selector experiment I completed on the final deployment.

| Stage | result |
|---|---|
| Working baseline | Both Pods were ready, and the Service returned the application JSON. |
| Wrong selector | I changed the Service selector to `app=wrong-app`, while the Pod labels stayed `app=midterm-app`. Both Pods remained 1/1 Running with zero restarts. The Service had no endpoints, and the request failed with connection refused. |
| Recovery | After I restored `app=midterm-app`, endpoints `10.244.0.8:8080` and `10.244.0.9:8080` returned. The Service request succeeded again. |

The selector mismatch caused this failure. The application Pods were healthy, but the Service could not select them.

## HTTP readiness

For the final readiness experiment, I used the HTTP `/health` probe in version 1.1. Creating `/tmp/not-ready` made the health endpoint fail while the application process kept running. Removing the marker restored readiness.

| Stage | result |
|---|---|
| Baseline health | The health endpoint returned HTTP 200 before I introduced the failure. |
| Readiness failure, process alive | The affected Pod showed 0/1 Ready but stayed Running. Its health endpoint returned HTTP 503, while a direct request to its root endpoint still worked. |
| Endpoint readiness during failure | The affected Pod's endpoint showed `ready: false`, while the other Pod's endpoint stayed ready. |
| Service traffic during failure | All five Service responses came from the remaining ready Pod, whose name ended in `zs6lj`. |
| Health recovery | Both Pods returned to 1/1 Ready with zero restarts, and the health endpoint returned HTTP 200. |
| Endpoint recovery | Both endpoint entries showed `ready: true` after recovery. |

Readiness determines which Pods can receive Service traffic. The affected application kept running during the failure and recovered without a container restart. The CPU and memory requests and limits are documented in `k8s/app.yaml` and explained in the report. These screenshots do not show a resource stress test.

