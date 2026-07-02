$udp = New-Object System.Net.Sockets.UdpClient
$udp.Client.ReceiveTimeout = 3000
$msg = "M-SEARCH * HTTP/1.1`r`nHOST: 239.255.255.250:1900`r`nMAN: `"ssdp:discover`"`r`nMX: 2`r`nST: urn:schemas-upnp-org:device:MediaServer:1`r`n`r`n"
$bytes = [Text.Encoding]::ASCII.GetBytes($msg)
$ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse("239.255.255.250"),1900)
[void]$udp.Send($bytes,$bytes.Length,$ep)
try { while($true){ $r=$null; $resp=[Text.Encoding]::ASCII.GetString($udp.Receive([ref]$r)); ($resp -split "`r`n") | ? { $_ -match "^LOCATION:" } | % { "$($r.Address) -> $_" } } } catch {}
$udp.Close()