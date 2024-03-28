// Github Projects Imports
import { graphql } from '@octokit/graphql';

let gql;
let projectId;

/** Fields for the-raul testing project. needs to change these for prod. TODO
 * 
 * Fields:
{
    "node": {
        "fields": {
            "nodes": [
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxc",
                    "name": "Title"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxg",
                    "name": "Assignees"
                },
                {
                    "id": "PVTSSF_lADOCXQacM4AccWTzgSYUxk",
                    "name": "Status",
                    "options": [
                        {
                            "id": "f75ad846",
                            "name": "Open Bounty"
                        },
                        {
                            "id": "47fc9ee4",
                            "name": "In progress"
                        },
                        {
                            "id": "d4a2e9a1",
                            "name": "In Review"
                        },
                        {
                            "id": "98236657",
                            "name": "Done"
                        }
                    ]
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxo",
                    "name": "Labels"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUxs",
                    "name": "Linked pull requests"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUx0",
                    "name": "Reviewers"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUx4",
                    "name": "Repository"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUx8",
                    "name": "Milestone"
                },
                {
                    "id": "PVTF_lADOCXQacM4AccWTzgSYUyQ",
                    "name": "USDC Payout"
                }
            ]
        }
    }
}
 * 
 * 
 * 
 * 
 */

// TODO: Change from hardcoded to dynamic? Or at match to current project
const status = {
  id: 'PVTSSF_lADOCXQacM4AccWTzgSYUxk',
  'Open Bounty': 'f75ad846',
  'In Progress': '47fc9ee4',
  'In Review': 'd4a2e9a1',
  Done: '98236657',
};

async function init(authKey, githubOrg, projectNumber, verbose = false) {
  // Setup Github API auth
  gql = graphql.defaults({
    headers: {
      authorization: `token ${authKey}`,
    },
  });

  // Grab project ID from org and project number
  const project = await gql(`
	{
		organization(login: "${githubOrg}"){
			projectV2(number: ${projectNumber}){
			  id
			}
    }
  }
      `);

  console.log(project);

  console.log(
    'Setting Active Project ID: ',
    project.organization.projectV2?.id
  );

  // Grab fields for project
  if (verbose) {
    const fields = await gql(`
  query{
	node(id: "${project.organization.projectV2.id}") {
	  ... on ProjectV2 {
	    fields(first: 20) {
	      nodes {
		... on ProjectV2Field {
		  id
		  name
		}
		... on ProjectV2IterationField {
		  id
		  name
		  configuration {
		    iterations {
		      startDate
		      id
		    }
		  }
		}
		... on ProjectV2SingleSelectField {
		  id
		  name
		  options {
		    id
		    name
		  }
		}
	      }
	    }
	  }
	}
      }
      `);
    console.log('Fields: ');

    console.log(JSON.stringify(fields, null, 4));
  }

  projectId = project.organization.projectV2?.id;
}

async function addIssueToProject(issue, verbose = true) {
  if (verbose) {
    console.log('Adding Issue to Project: ');
    console.log(JSON.stringify(issue, null, 4));
    // Interesting issue fields:
    //     state
    //     assignee
    //     assignees
    //     state_reason
  }

  // see: https://docs.github.com/en/graphql/reference/objects#projectv2item
  const result = await gql(` 
	mutation {
		addProjectV2ItemById(input: {projectId: "${projectId}" contentId: "${issue.node_id}"}) {
			item {
				id
				content
			}
		}
	}
	`);

  // fieldValues
  // fieldValueByName("string")

  console.log(
    'Added Issue as Item to Project: ',
    result.addProjectV2ItemById.item.id
  );

  //

  // TODO: if no status, change to Open Bounty, might need to
  changeIssueStatus(result.addProjectV2ItemById.item.id, 'Open Bounty');

  return;
}

async function changeIssueStatus(itemId, statusLabel) {
  await gql(` 
  mutation {
	updateProjectV2ItemFieldValue(
	  input: {
	    projectId: "${projectId}"
	    itemId: "${itemId}"
	    fieldId: "${status.id}"
	    value: { 
	      singleSelectOptionId: "${status[statusLabel]}"        
	    }
	  }
	) {
	  projectV2Item {
	    id
	  }
	}
      }
	`);
}

const project = {
  init: init,
  addIssueToProject: addIssueToProject,
};

export default project;
