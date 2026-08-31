<#
.SYNOPSIS
  Beschränkt die Entra-App „Frenken Verwaltung“ auf freigegebene Shared Postfächer.

.DESCRIPTION
  Application-Permission Mail.ReadWrite gilt standardmäßig für ALLE Postfächer.
  Entra kann das nicht eingrenzen — nur Exchange Online Application Access Policy.

  Freigegeben: ankauf@ (Offene Exposés), post@ und m.frenken@ (Dokumente › Postfach).
  OneDrive (Files.*) wird von dieser Policy NICHT beschränkt.

  Voraussetzungen:
  - Exchange Admin (oder Global Admin)
  - Modul ExchangeOnlineManagement
  - PowerShell 7 empfohlen

.NOTES
  Client-ID der App: fcacca52-9a81-46f9-b250-9a4b6059b7bb
#>

param(
  [string]$AppId = "fcacca52-9a81-46f9-b250-9a4b6059b7bb",
  [string[]]$Mailboxes = @(
    "ankauf@frenken-immobilien.com",
    "post@frenken-immobilien.com",
    "m.frenken@frenken-immobilien.com"
  ),
  [string]$GroupName = "Frenken-Graph-Ankauf-Only",
  [string]$ProbeMailbox = "m.frenken@frenken-immobilien.com"
)

$ErrorActionPreference = "Stop"

Write-Host ">>> Exchange Online verbinden…" -ForegroundColor Cyan
Import-Module ExchangeOnlineManagement -ErrorAction Stop
Connect-ExchangeOnline

Write-Host ">>> Mail-enabled Security Group '$GroupName' sicherstellen…" -ForegroundColor Cyan
$group = Get-DistributionGroup -Identity $GroupName -ErrorAction SilentlyContinue
if (-not $group) {
  $group = New-DistributionGroup `
    -Name $GroupName `
    -Type Security `
    -PrimarySmtpAddress ($GroupName.ToLower() + "@frenken-immobilien.com") `
    -Notes "Mitglieder = Postfächer, die Frenken Verwaltung (Graph App) lesen darf"
  Write-Host "    Gruppe angelegt." -ForegroundColor Green
} else {
  Write-Host "    Gruppe existiert bereits." -ForegroundColor DarkGray
}

$members = Get-DistributionGroupMember -Identity $GroupName -ResultSize Unlimited |
  Select-Object -ExpandProperty PrimarySmtpAddress

foreach ($Mailbox in $Mailboxes) {
  Write-Host ">>> $Mailbox zur Gruppe hinzufügen…" -ForegroundColor Cyan
  if ($members -notcontains $Mailbox) {
    Add-DistributionGroupMember -Identity $GroupName -Member $Mailbox
    Write-Host "    Mitglied hinzugefügt." -ForegroundColor Green
    $members += $Mailbox
  } else {
    Write-Host "    Mitglied war schon drin." -ForegroundColor DarkGray
  }
}

Write-Host ">>> Application Access Policy (RestrictAccess)…" -ForegroundColor Cyan
$existing = Get-ApplicationAccessPolicy -ErrorAction SilentlyContinue |
  Where-Object { $_.AppId -eq $AppId }

if ($existing) {
  Write-Host "    Vorhandene Policy(s) für diese App:" -ForegroundColor Yellow
  $existing | Format-Table AppId, ScopeName, AccessRight, Description -AutoSize
  Write-Host "    Entferne alte Policy(s) und lege neu an…" -ForegroundColor Yellow
  foreach ($p in $existing) {
    Remove-ApplicationAccessPolicy -Identity $p.Identity -Confirm:$false
  }
}

New-ApplicationAccessPolicy `
  -AppId $AppId `
  -PolicyScopeGroupId $GroupName `
  -AccessRight RestrictAccess `
  -Description "Frenken Expose Agent: Shared Postfächer ankauf@ und post@"

Write-Host ">>> Tests (Propagation kann bis ~1 Stunde dauern)…" -ForegroundColor Cyan
Start-Sleep -Seconds 5

foreach ($Mailbox in $Mailboxes) {
  Write-Host "    Erlaubt für $Mailbox :" -ForegroundColor DarkGray
  Test-ApplicationAccessPolicy -Identity $Mailbox -AppId $AppId | Format-List
}

if ($ProbeMailbox) {
  Write-Host "    Muss DENIED sein für $ProbeMailbox (Mail; OneDrive separat via Files.*) :" -ForegroundColor DarkGray
  Test-ApplicationAccessPolicy -Identity $ProbeMailbox -AppId $AppId | Format-List
}

Write-Host @"

Fertig. Danach in der App unter Integrationen „Verbindung prüfen“
(holt frisches Token inkl. Files.ReadWrite.All).
"@ -ForegroundColor Green

Disconnect-ExchangeOnline -Confirm:$false
