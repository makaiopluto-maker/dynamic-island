param(
  [Parameter(Mandatory = $true)][ValidateSet("get", "set")][string]$Action,
  [int]$Level = 0
)

$ErrorActionPreference = "Stop"

if (-not ("MonitorBrightness" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MonitorBrightness {
  delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, IntPtr lprcMonitor, IntPtr dwData);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, ref uint count);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint count, [Out] PHYSICAL_MONITOR[] monitors);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool DestroyPhysicalMonitor(IntPtr hMonitor);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool SetVCPFeature(IntPtr hMonitor, byte code, uint value);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr hMonitor, byte code, ref uint type, ref uint current, ref uint max);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  struct PHYSICAL_MONITOR {
    public IntPtr hPhysicalMonitor;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string szPhysicalMonitorDescription;
  }
  public static int SetAll(int level) {
    int changed = 0;
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (h, hdc, rect, data) => {
      uint n = 0;
      if (!GetNumberOfPhysicalMonitorsFromHMONITOR(h, ref n) || n == 0) return true;
      var arr = new PHYSICAL_MONITOR[n];
      if (!GetPhysicalMonitorsFromHMONITOR(h, n, arr)) return true;
      foreach (var m in arr) {
        if (SetVCPFeature(m.hPhysicalMonitor, 0x10, (uint)level)) changed++;
        DestroyPhysicalMonitor(m.hPhysicalMonitor);
      }
      return true;
    }, IntPtr.Zero);
    return changed;
  }
  public static int GetFirst() {
    int found = -1;
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (h, hdc, rect, data) => {
      if (found >= 0) return true;
      uint n = 0;
      if (!GetNumberOfPhysicalMonitorsFromHMONITOR(h, ref n) || n == 0) return true;
      var arr = new PHYSICAL_MONITOR[n];
      if (!GetPhysicalMonitorsFromHMONITOR(h, n, arr)) return true;
      foreach (var m in arr) {
        uint type = 0, cur = 0, max = 0;
        if (found < 0 && GetVCPFeatureAndVCPFeatureReply(m.hPhysicalMonitor, 0x10, ref type, ref cur, ref max)) {
          found = max > 100 ? (int)Math.Round(cur * 100.0 / max) : (int)cur;
        }
        DestroyPhysicalMonitor(m.hPhysicalMonitor);
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
}

function Get-WmiLevel {
  $rows = @(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue)
  if ($rows.Count -lt 1) { return $null }
  return [int]$rows[0].CurrentBrightness
}

function Set-WmiLevel([int]$value) {
  $methods = @(Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue)
  $ok = $false
  foreach ($method in $methods) {
    Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$value } | Out-Null
    $ok = $true
  }
  return $ok
}

if ($Action -eq "get") {
  $wmi = Get-WmiLevel
  if ($null -ne $wmi) { Write-Output $wmi; exit 0 }
  $ddc = [MonitorBrightness]::GetFirst()
  if ($ddc -ge 0 -and $ddc -le 100) { Write-Output $ddc; exit 0 }
  Write-Output "none"
  exit 0
}

$clamped = [Math]::Max(0, [Math]::Min(100, $Level))
$moved = $false
try { if (Set-WmiLevel $clamped) { $moved = $true } } catch {}
try { if ([MonitorBrightness]::SetAll($clamped) -gt 0) { $moved = $true } } catch {}
if ($moved) { Write-Output $clamped } else { Write-Output "none" }
