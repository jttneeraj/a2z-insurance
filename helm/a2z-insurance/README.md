# a2z-insurance Helm Chart

Dev deployment target:

- Namespace: `a2z-dev`
- Release: `a2z-insurance`
- Image: `registry.digitalocean.com/a2z-registry-non-prod/a2z-insurance:0.0.1-dev`
- Port: `4015`
- URL path: `/insurance`
- Health path: `/ping`
- Replica count: `1`

## Dry run

```bash
helm template a2z-insurance ./helm/a2z-insurance \
  -n a2z-dev \
  -f ./helm/a2z-insurance/values-dev.yaml
```

## Deploy

```bash
helm upgrade --install a2z-insurance ./helm/a2z-insurance \
  --namespace a2z-dev \
  --create-namespace \
  --values ./helm/a2z-insurance/values-dev.yaml \
  --wait \
  --atomic \
  --timeout 5m
```

## Verify

```bash
kubectl get pods -n a2z-dev -l app.kubernetes.io/name=a2z-insurance
kubectl get svc -n a2z-dev | grep insurance
kubectl get ingress -n a2z-dev | grep insurance
kubectl logs -n a2z-dev deployment/a2z-insurance --tail=100
```

## Test

```bash
kubectl port-forward -n a2z-dev svc/a2z-insurance-svc 4015:4015
curl http://localhost:4015/ping
curl https://dev.a2zsuvidhaa.in/insurance/ping
```
