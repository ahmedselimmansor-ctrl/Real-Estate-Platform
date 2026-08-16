# Environments

Two files per environment:

| file                   | purpose                                                        |
|------------------------|----------------------------------------------------------------|
| `<env>.backend.hcl`    | where the state lives (passed to `terraform init`)             |
| `<env>.tfvars`         | sizing and toggles for that environment (passed to `plan`/`apply`) |

```bash
cd infra/terraform
terraform init -reconfigure -backend-config=environments/prod.backend.hcl
terraform plan -var-file=environments/prod.tfvars
```

`<bucket>` in the backend files comes from the `backend_config` output of
`../bootstrap`. It is not committed with a real account id because the same
repo is meant to be deployable into any account.
