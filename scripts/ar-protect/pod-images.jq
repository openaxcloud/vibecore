# A Job can still be running, and a ReplicaSet can leave terminal pods behind.
# Keep nonterminal pods, including terminating pods until they actually exit.
if (.items | type) != "array" or (.metadata.continue // "") != "" then error("incomplete pod inventory") else . end
| .items[] | select(.status.phase != "Succeeded" and .status.phase != "Failed")
| . as $pod
| (.spec.containers[], .spec.initContainers[]?, .spec.ephemeralContainers[]?) as $container
| $container.image,
  (($pod.status.containerStatuses[]?, $pod.status.initContainerStatuses[]?, $pod.status.ephemeralContainerStatuses[]?)
   | select(.name == $container.name)
   | (.imageID // "") | sub("^docker-pullable://"; "")
   | select(contains("/") and test("@sha256:[a-f0-9]{64}$")))
