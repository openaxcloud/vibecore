# A Job can still be running, and a ReplicaSet can leave terminal pods behind.
# Keep nonterminal pods, including terminating pods until they actually exit.
if length != 1 then error("expected one pod inventory") else .[0] end
| if (.items | type) != "array" or (.items | length) == 0 or (.metadata.continue // "") != "" then error("incomplete pod inventory") else . end
| .items[] | select(.status.phase != "Succeeded" and .status.phase != "Failed")
| . as $pod
| if (.spec.containers | type == "array" and length > 0) then . else error("missing pod containers") end
| (.spec.containers[], .spec.initContainers[]?, .spec.ephemeralContainers[]?) as $container
| (if ($container.image | type == "string" and test("^\\S+$")) then $container.image else error("missing pod image") end),
  (($pod.status.containerStatuses[]?, $pod.status.initContainerStatuses[]?, $pod.status.ephemeralContainerStatuses[]?)
   | select(.name == $container.name)
   | (.imageID // "") | sub("^docker-pullable://"; "")
   | select(contains("/") and test("@sha256:[a-f0-9]{64}$")))
