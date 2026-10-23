<#
.SYNOPSIS
  Beschränkt die Entra-App „Grenz & Co. Verwaltung“ auf freigegebene Postfächer.

.DESCRIPTION
  Application-Permission Mail.ReadWrite gilt standardmäßig für ALLE Postfächer.
  Entra kann das nicht eingrenzen — nur Exchange Online Application Access Policy.

  Freigeben: die Postfächer aus MICROSOFT_MAILBOX (Offene Exposés),
  MICROSOFT_POST_MAILBOX und ggf. MICROSOFT_POST_MAILBOX_ZWEIT (Dokumente › Postfach).
  OneDrive (Files.*) wird von dieser Policy NICHT beschränkt.

.EXAMPLE
  ./microsoft-access-policy.ps1 -AppId <Client-ID> `
    -Mailboxes expose@grenz.example,post@grenz.example `
    -GroupDomain grenz.example -ProbeMailbox chef@grenz.example

  Voraussetzungen:
  - Exchange Admin (oder Global Admin)
  - Modul ExchangeOnlineManagement
  - PowerShell 7 empfohlen
#>

param(
  # Client-ID der Entra-App (MICROSOFT_CLIENT_ID)
  [Parameter(Mandatory = $true)][string]$AppId,
  [Parameter(Mandatory = $true)][string[]]$Mailboxes,
  # Domain für die Adresse der Sicherheitsgruppe, z. B. grenz.example
  [Parameter(Mandatory = $true)][string]$GroupDomain,
  [string]$GroupName = "Grenz-Graph-Postfaecher",
  # Postfach, für das der Zugriff verweigert sein muss (Kontrolltest)
  [string]$ProbeMailbox = ""
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
    -PrimarySmtpAddress ($GroupName.ToLower() + "@" + $GroupDomain) `
    -Notes "Mitglieder = Postfächer, die Grenz & Co. Verwaltung (Graph App) lesen darf"
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
  -Description "Grenz & Co. Verwaltung: freigegebene Postfächer"

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
